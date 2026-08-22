import { Router } from "express";
import { sendMessage, replyToMessage } from "../controllers/telegram.controller.js";

const telegramRouter = Router();

telegramRouter.post('/telegram/messages', sendMessage);
telegramRouter.post('/telegram/messages/reply', replyToMessage);

export default telegramRouter;
