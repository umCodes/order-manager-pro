import { Router } from "express";
import { getItemCategories, getNotificationTemplates, updateItemCategoryOrder, updateNotificationTemplates } from "../controllers/settings.controller.js";

export const settingsRouter = Router();

settingsRouter.get('/settings/notification-templates', getNotificationTemplates);
settingsRouter.put('/settings/notification-templates', updateNotificationTemplates);
settingsRouter.get('/settings/item-categories', getItemCategories);
settingsRouter.put('/settings/item-categories', updateItemCategoryOrder);
