import express from "express";
import invoicesRouter from "./routes/invoices.routes.js";
import itemsRouter from "./routes/items.routes.js";
import { refreshZohoToken } from "./middlewares/zoho_refresh_tokens.middleware.js";
import { validateEnv } from "./middlewares/env_validate.middleware.js";
import cors from 'cors';
import { customersRouter } from "./routes/customers.routes.js";
import { connectRedis } from './config/redis.js';
import telegramRouter from "./routes/telegram.routes.js";
import zohoUsageRouter from "./routes/zoho-usage.routes.js";
import waWebhookRouter from "./routes/wa-webhook.routes.js";
import { IS_PRODUCTION, FRONTEND_URL } from "./constants/env.js";

connectRedis().catch((error) => console.error('Failed to connect to Redis', error));

const app = express();
const port = process.env.PORT || 3000;

if (IS_PRODUCTION && !FRONTEND_URL) {
    throw new Error("FRONTEND_URL must be set in production");
}

app.use(express.json());
app.use(cors({
    origin: IS_PRODUCTION
        ? FRONTEND_URL
        : [/^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/, /^http:\/\/localhost:\d+$/]
}));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(waWebhookRouter);

const apiRouters = [
    telegramRouter,
    invoicesRouter,
    itemsRouter,
    customersRouter,
    zohoUsageRouter
];

app.use('/api', validateEnv, refreshZohoToken, ...apiRouters);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
