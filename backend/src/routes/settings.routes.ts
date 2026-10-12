import { Router } from "express";
import { getNotificationTemplates, updateNotificationTemplates } from "../controllers/settings.controller.js";

export const settingsRouter = Router();

settingsRouter.get('/settings/notification-templates', getNotificationTemplates);
settingsRouter.put('/settings/notification-templates', updateNotificationTemplates);
