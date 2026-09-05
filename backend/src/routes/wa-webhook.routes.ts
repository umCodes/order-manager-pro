import { Router } from "express";
import { handleWaWebhook } from "../controllers/wa-webhook.controller.js";

export const waWebhookRouter = Router();

waWebhookRouter.get('/wa-webhook', handleWaWebhook);
