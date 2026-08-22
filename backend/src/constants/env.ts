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

  REDIS_URL: process.env.REDIS_URL,
};