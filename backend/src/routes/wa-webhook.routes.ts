import { Router } from "express";
import { handleWaWebhookVerification, handleWaWebhookEvent } from "../controllers/wa-webhook.controller.js";

export const waWebhookRouter = Router();

waWebhookRouter.get('/wa-webhook', handleWaWebhookVerification);
waWebhookRouter.post('/wa-webhook', handleWaWebhookEvent);
