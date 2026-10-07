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
    getWhatsAppTemplates,
    createWhatsAppTemplate,
    sendWhatsAppChatTemplate,
    uploadWhatsAppTemplateSample,
    uploadWhatsAppTemplateMedia,
    getWhatsAppActionTemplates,
    setWhatsAppActionTemplate,
    clearWhatsAppActionTemplate,
    MAX_MEDIA_BYTES,
} from "../controllers/whatsapp-chats.controller.js";

export const whatsappRouter = Router();

whatsappRouter.get('/whatsapp/chats', getWhatsAppChats);
whatsappRouter.get('/whatsapp/unread', getWhatsAppUnread);
whatsappRouter.post('/whatsapp/chats/:phone/read', markWhatsAppChatRead);
whatsappRouter.get('/whatsapp/chats/:phone/messages', getWhatsAppChatMessages);
whatsappRouter.post('/whatsapp/chats/:phone/messages', sendWhatsAppChatMessage);
whatsappRouter.post('/whatsapp/chats/:phone/messages/:messageId/retry', retryWhatsAppChatMessage);
whatsappRouter.post('/whatsapp/chats/:phone/templates', sendWhatsAppChatTemplate);
whatsappRouter.get('/whatsapp/templates', getWhatsAppTemplates);
whatsappRouter.post('/whatsapp/templates', createWhatsAppTemplate);
whatsappRouter.get('/whatsapp/action-templates', getWhatsAppActionTemplates);
whatsappRouter.put('/whatsapp/action-templates/:action/:language', setWhatsAppActionTemplate);
whatsappRouter.delete('/whatsapp/action-templates/:action/:language', clearWhatsAppActionTemplate);
const rawUpload = express.raw({ type: "application/octet-stream", limit: MAX_MEDIA_BYTES });
whatsappRouter.post('/whatsapp/templates/sample', rawUpload, uploadWhatsAppTemplateSample);
whatsappRouter.post('/whatsapp/templates/media', rawUpload, uploadWhatsAppTemplateMedia);
whatsappRouter.post(
    '/whatsapp/chats/:phone/media',
    express.raw({ type: "application/octet-stream", limit: MAX_MEDIA_BYTES }),
    sendWhatsAppChatMedia,
);
whatsappRouter.get('/whatsapp/chats/:phone/messages/:messageId/media', getWhatsAppChatMedia);
