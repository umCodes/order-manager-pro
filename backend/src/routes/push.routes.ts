import { Router } from "express";
import { getPushPublicKey, subscribeToPush, unsubscribeFromPush } from "../controllers/push.controller.js";

export const pushRouter = Router();

pushRouter.get('/push/public-key', getPushPublicKey);
pushRouter.post('/push/subscriptions', subscribeToPush);
pushRouter.delete('/push/subscriptions', unsubscribeFromPush);
