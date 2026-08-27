import { config } from "dotenv";

config();

export const ENV = {
  ZOHO_REFRESH_TOKEN: process.env.ZOHO_REFRESH_TOKEN,

  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET,

  ORGANIZATION_ID: process.env.ORGANIZATION_ID,
  REDIRECT_URI: process.env.REDIRECT_URI,

  TELEGRAM_CHANNEL_LINK: process.env.TELEGRAM_CHANNEL_LINK,
  TELEGRAM_CHATID: process.env.TELEGRAM_CHATID,
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  PORT: process.env.PORT || 3000,

  WA_PREP_NUM: process.env.WA_PREP_NUM,
  WA_TOKEN: process.env.WA_TOKEN,
  WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN,
  
  REDIS_URL: process.env.REDIS_URL,
  
};

// Not part of ENV/validateEnv: NODE_ENV is optional (absence means dev), and
// FRONTEND_URL is only required in production, not on every request.
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const FRONTEND_URL = process.env.FRONTEND_URL;