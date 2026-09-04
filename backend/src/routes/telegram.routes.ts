import { Router } from "express";
import { sendMessage, replyToMessage, listMessages, editMessage, deleteMessage } from "../controllers/telegram.controller.js";

const telegramRouter = Router();

telegramRouter.get('/telegram/messages', listMessages);
telegramRouter.post('/telegram/messages', sendMessage);
telegramRouter.post('/telegram/messages/reply', replyToMessage);
telegramRouter.patch('/telegram/messages/:messageId', editMessage);
telegramRouter.delete('/telegram/messages/:messageId', deleteMessage);

export default telegramRouter;
