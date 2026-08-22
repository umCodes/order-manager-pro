import { config } from "dotenv";

config();

export const ENV = {
  ZOHO_ACCESS_TOKEN: process.env.ZOHO_ACCESS_TOKEN,
  ZOHO_REFRESH_TOKEN: process.env.ZOHO_REFRESH_TOKEN,

  API_URL: process.env.API_URL,

  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET,

  EXPIRES_AT: process.env.EXPIRES_AT,
  ORGANIZATION_ID: process.env.ORGANIZATION_ID,
  REDIRECT_URI: process.env.REDIRECT_URI,
  SERVER_URL: process.env.SERVER_URL,

  TELEGRAM_CHANNEL_LINK: process.env.TELEGRAM_CHANNEL_LINK,
  TELEGRAM_CHATID: process.env.TELEGRAM_CHATID,
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || 3000,
  WA_PREP_NUM: process.env.WA_PREP_NUM,

  REDIS_URL: process.env.REDIS_URL,
};