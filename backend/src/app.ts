import express from "express";
import cors from "cors";
import { FRONTEND_URL, IS_PRODUCTION } from "./constants/env.js";
import { refreshZohoToken, validateEnv } from "./middlewares/index.js";
import { apiRouters, waWebhookRouter } from "./routes/index.js";

/**
 * Builds the Express app: JSON parsing, CORS, the health check, the WhatsApp
 * webhook (which Meta calls unauthenticated), and everything under /api
 * behind env validation and a fresh Zoho token. Kept separate from index.ts
 * so starting the server and assembling it are two different things.
 */
export function createApp() {
    if (IS_PRODUCTION && !FRONTEND_URL) {
        throw new Error("FRONTEND_URL must be set in production");
    }

    const app = express();

    app.use(express.json());
    app.use(cors({
        origin: IS_PRODUCTION
            ? FRONTEND_URL
            : [/^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/, /^http:\/\/localhost:\d+$/]
    }));

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.use(waWebhookRouter);

    app.use('/api', validateEnv, refreshZohoToken, ...apiRouters);

    return app;
}
