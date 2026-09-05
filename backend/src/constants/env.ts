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
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID || "1250845681454031",

  WA_PAYMENT_NOTIFICATION_TEMPLATE_AM: process.env.WA_PAYMENT_NOTIFICATION_TEMPLATE_AM,
  WA_PAYMENT_NOTIFICATION_TEMPLATE_AR: process.env.WA_PAYMENT_NOTIFICATION_TEMPLATE_AR,
  WA_PAYMENT_NOTIFICATION_TEMPLATE_EN: process.env.WA_PAYMENT_NOTIFICATION_TEMPLATE_EN,

  WA_BALANCE_NOTIFICATION_TEMPLATE_AM: process.env.WA_BALANCE_NOTIFICATION_TEMPLATE_AM,
  WA_BALANCE_NOTIFICATION_TEMPLATE_AR: process.env.WA_BALANCE_NOTIFICATION_TEMPLATE_AR,
  WA_BALANCE_NOTIFICATION_TEMPLATE_EN: process.env.WA_BALANCE_NOTIFICATION_TEMPLATE_EN,

  /** Number given to customers (via the auto-reply) as the one to contact instead, since this webhook's number isn't monitored. */
  WA_SUPPORT_NUMBER: process.env.WA_SUPPORT_NUMBER,

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  /** Mailbox that gets notified of every inbound WhatsApp message. */
  WA_NOTIFY_EMAIL_TO: process.env.WA_NOTIFY_EMAIL_TO,

  REDIS_URL: process.env.REDIS_URL,

};

// Not part of ENV/validateEnv: NODE_ENV is optional (absence means dev), and
// FRONTEND_URL is only required in production, not on every request.
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const FRONTEND_URL = process.env.FRONTEND_URL;