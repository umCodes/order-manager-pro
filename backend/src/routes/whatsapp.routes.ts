import express, { Router } from "express";
import {
    getWhatsAppChats,
    getWhatsAppChatMessages,
    sendWhatsAppChatMessage,
    retryWhatsAppChatMessage,
    sendWhatsAppChatMedia,
    getWhatsAppChatMedia,
    MAX_MEDIA_BYTES,
} from "../controllers/whatsapp-chats.controller.js";

export const whatsappRouter = Router();

whatsappRouter.get('/whatsapp/chats', getWhatsAppChats);
whatsappRouter.get('/whatsapp/chats/:phone/messages', getWhatsAppChatMessages);
whatsappRouter.post('/whatsapp/chats/:phone/messages', sendWhatsAppChatMessage);
whatsappRouter.post('/whatsapp/chats/:phone/messages/:messageId/retry', retryWhatsAppChatMessage);
whatsappRouter.post(
    '/whatsapp/chats/:phone/media',
    express.raw({ type: "application/octet-stream", limit: MAX_MEDIA_BYTES }),
    sendWhatsAppChatMedia,
);
whatsappRouter.get('/whatsapp/chats/:phone/messages/:messageId/media', getWhatsAppChatMedia);
