import { Router } from "express";
import {
    getDailyReportWhatsApp,
    getInvoiceDue,
    getGeneralItems,
    getGeneralItemsWhatsApp,
    getItemCategories,
    getNotificationTemplates,
    updateDailyReportWhatsApp,
    updateInvoiceDue,
    updateGeneralItems,
    updateGeneralItemsWhatsApp,
    updateItemCategoryOrder,
    updateNotificationTemplates,
} from "../controllers/settings.controller.js";

export const settingsRouter = Router();

settingsRouter.get('/settings/notification-templates', getNotificationTemplates);
settingsRouter.put('/settings/notification-templates', updateNotificationTemplates);
settingsRouter.get('/settings/item-categories', getItemCategories);
settingsRouter.put('/settings/item-categories', updateItemCategoryOrder);
settingsRouter.get('/settings/daily-report-whatsapp', getDailyReportWhatsApp);
settingsRouter.put('/settings/daily-report-whatsapp', updateDailyReportWhatsApp);
settingsRouter.get('/settings/invoice-due', getInvoiceDue);
settingsRouter.put('/settings/invoice-due', updateInvoiceDue);
settingsRouter.get('/settings/general-items', getGeneralItems);
settingsRouter.put('/settings/general-items', updateGeneralItems);
settingsRouter.get('/settings/general-items-whatsapp', getGeneralItemsWhatsApp);
settingsRouter.put('/settings/general-items-whatsapp', updateGeneralItemsWhatsApp);
