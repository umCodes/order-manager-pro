import { Router } from "express";
import { getWhatsAppChats, getWhatsAppChatMessages, sendWhatsAppChatMessage, retryWhatsAppChatMessage } from "../controllers/whatsapp-chats.controller.js";

export const whatsappRouter = Router();

whatsappRouter.get('/whatsapp/chats', getWhatsAppChats);
whatsappRouter.get('/whatsapp/chats/:phone/messages', getWhatsAppChatMessages);
whatsappRouter.post('/whatsapp/chats/:phone/messages', sendWhatsAppChatMessage);
whatsappRouter.post('/whatsapp/chats/:phone/messages/:messageId/retry', retryWhatsAppChatMessage);
