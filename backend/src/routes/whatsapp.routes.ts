import express, { Router } from "express";
import {
    getWhatsAppChats,
    getWhatsAppChatMessages,
    sendWhatsAppChatMessage,
    retryWhatsAppChatMessage,
    sendWhatsAppChatMedia,
    getWhatsAppChatMedia,
    getWhatsAppUnread,
    markWhatsAppChatRead,
    saveWhatsAppContact,
    lookupWhatsAppContact,
    removeWhatsAppContact,
    getWhatsAppTemplates,
    createWhatsAppTemplate,
    deleteWhatsAppTemplate,
    sendWhatsAppChatTemplate,
    uploadWhatsAppTemplateSample,
    uploadWhatsAppTemplateMedia,
    MAX_MEDIA_BYTES,
} from "../controllers/whatsapp-chats.controller.js";

export const whatsappRouter = Router();

whatsappRouter.get('/whatsapp/chats', getWhatsAppChats);
whatsappRouter.get('/whatsapp/unread', getWhatsAppUnread);
whatsappRouter.post('/whatsapp/chats/:phone/read', markWhatsAppChatRead);
whatsappRouter.get('/whatsapp/chats/:phone/contact/lookup', lookupWhatsAppContact);
whatsappRouter.put('/whatsapp/chats/:phone/contact', saveWhatsAppContact);
whatsappRouter.delete('/whatsapp/chats/:phone/contact', removeWhatsAppContact);
whatsappRouter.get('/whatsapp/chats/:phone/messages', getWhatsAppChatMessages);
whatsappRouter.post('/whatsapp/chats/:phone/messages', sendWhatsAppChatMessage);
whatsappRouter.post('/whatsapp/chats/:phone/messages/:messageId/retry', retryWhatsAppChatMessage);
whatsappRouter.post('/whatsapp/chats/:phone/templates', sendWhatsAppChatTemplate);
whatsappRouter.get('/whatsapp/templates', getWhatsAppTemplates);
whatsappRouter.post('/whatsapp/templates', createWhatsAppTemplate);
whatsappRouter.delete('/whatsapp/templates/:id', deleteWhatsAppTemplate);
const rawUpload = express.raw({ type: "application/octet-stream", limit: MAX_MEDIA_BYTES });
whatsappRouter.post('/whatsapp/templates/sample', rawUpload, uploadWhatsAppTemplateSample);
whatsappRouter.post('/whatsapp/templates/media', rawUpload, uploadWhatsAppTemplateMedia);
whatsappRouter.post(
    '/whatsapp/chats/:phone/media',
    express.raw({ type: "application/octet-stream", limit: MAX_MEDIA_BYTES }),
    sendWhatsAppChatMedia,
);
whatsappRouter.get('/whatsapp/chats/:phone/messages/:messageId/media', getWhatsAppChatMedia);
