import { Router } from "express";
import { sendMessage, sendItemsList, replyToMessage, listMessages, editMessage, deleteMessage, getGroupOrderMessage, listGroupReplies } from "../controllers/telegram/index.js";

export const telegramRouter = Router();

telegramRouter.get('/telegram/messages', listMessages);
telegramRouter.post('/telegram/messages', sendMessage);
telegramRouter.post('/telegram/messages/reply', replyToMessage);
telegramRouter.post('/telegram/items-list', sendItemsList);
telegramRouter.patch('/telegram/messages/:messageId', editMessage);
telegramRouter.delete('/telegram/messages/:messageId', deleteMessage);
telegramRouter.get('/telegram/group/messages/:messageId', getGroupOrderMessage);
telegramRouter.get('/telegram/group/replies', listGroupReplies);
