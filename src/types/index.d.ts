export interface IData {
  op: string;
  heartbeat_interval?: number;
  timeout_ms?: number;
  encrypted_nonce?: string;
  fingerprint?: string;
  encrypted_user_payload?: string;
  encrypted_token?: string;
  ticket?: string;
}

export interface ITicketData {
  captcha_key?: string[];
  captcha_sitekey?: string;
  captcha_service?: string;
  captcha_rqdata?: string;
  captcha_rqtoken?: string;
  encrypted_token?: string;
  code?: number;
}
