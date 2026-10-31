import { Router } from "express";
import { sendMessage, sendItemsList, replyToMessage, listMessages, editMessage, deleteMessage, getGroupOrderMessage, listGroupReplies, getOrderShortages, getOrderPreparation, listOrderPreparationStatuses } from "../controllers/telegram/index.js";

export const telegramRouter = Router();

telegramRouter.get('/telegram/messages', listMessages);
telegramRouter.post('/telegram/messages', sendMessage);
telegramRouter.post('/telegram/messages/reply', replyToMessage);
telegramRouter.post('/telegram/items-list', sendItemsList);
telegramRouter.patch('/telegram/messages/:messageId', editMessage);
telegramRouter.delete('/telegram/messages/:messageId', deleteMessage);
telegramRouter.get('/telegram/group/messages/:messageId', getGroupOrderMessage);
telegramRouter.get('/telegram/group/replies', listGroupReplies);
telegramRouter.get('/telegram/group/orders/:orderId/shortages', getOrderShortages);
telegramRouter.get('/telegram/group/orders/:orderId/preparation', getOrderPreparation);
telegramRouter.get('/telegram/group/preparation', listOrderPreparationStatuses);
