import { Router } from "express";
import { handleWaWebhook } from "../controllers/wa-webhook.controller.js";

const waWebhookRouter = Router();

waWebhookRouter.post('/wa-webhook', handleWaWebhook);

export default waWebhookRouter;