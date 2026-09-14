import { Router } from "express";
import { listWhatsAppMessages } from "../controllers/whatsapp/index.js";

export const whatsappRouter = Router();

whatsappRouter.get("/whatsapp/messages", listWhatsAppMessages);
