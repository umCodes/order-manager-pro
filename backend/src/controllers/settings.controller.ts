import type { Request, Response } from 'express';
import {
    defaultNotificationTemplates,
    getNotificationTemplateSettings,
    notificationTemplateOptions,
    saveNotificationTemplateSettings,
} from '../services/whatsapp/notificationTemplates.js';
import { getItemCategoryOrder, saveItemCategoryOrder } from '../services/itemCategoryOrder.js';
import { catalogCategories, getCatalog } from '../services/zoho/items.js';
import {
    MAX_RECIPIENTS,
    dailyReportTemplateOptions,
    getDailyReportWhatsAppSettings,
    saveDailyReportWhatsAppSettings,
} from '../services/dailyReport/whatsapp.js';
import { getInvoiceDueSetting, MAX_DUE_DAYS, saveInvoiceDueSetting } from '../services/invoiceDueDate.js';
import { getGeneralItemIds, MAX_GENERAL_ITEMS, saveGeneralItemIds } from '../services/generalItems.js';

/**
 * The notification template settings: what's chosen per notification and
 * language (`selected`, empty slots use `defaults` from the env), and the
 * approved templates each notification can be switched to (`options`).
 */
export async function getNotificationTemplates(req: Request, res: Response) {
    try {
        const [selected, options] = await Promise.all([
            getNotificationTemplateSettings(),
            notificationTemplateOptions(req.query.refresh === "1"),
        ]);
        res.status(200).json({ selected, defaults: defaultNotificationTemplates(), options });
    } catch (error) {
        console.error('Error loading notification template settings:', error);
        res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to load template settings' });
    }
}

/** Saves which template each notification uses, per language (null = back to the default). */
export async function updateNotificationTemplates(req: Request, res: Response) {
    try {
        const selected = await saveNotificationTemplateSettings(req.body);
        res.status(200).json({ selected });
    } catch (error) {
        console.error('Error saving notification template settings:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save template settings' });
    }
}

/**
 * The Items tab's category order (`order`, highest priority first) and every
 * category in the item catalog (`categories`) so new ones can be placed.
 * `source` is "invoice" when Zoho Inventory couldn't be reached, in which
 * case there are no categories.
 */
export async function getItemCategories(req: Request, res: Response) {
    const access_token = req.headers["Authorization"]
    try {
        if (!access_token || access_token instanceof Array) throw new Error("Missing Zoho access token")
        const [order, catalog] = await Promise.all([getItemCategoryOrder(), getCatalog(access_token, req.query.refresh === "1")])
        res.status(200).json({ order, categories: catalogCategories(catalog.items), source: catalog.source });
    } catch (error) {
        console.error('Error loading item categories:', error);
        res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to load item categories' });
    }
}

/** Saves the Items tab's category order. */
export async function updateItemCategoryOrder(req: Request, res: Response) {
    try {
        const order = await saveItemCategoryOrder(req.body?.order);
        res.status(200).json({ order });
    } catch (error) {
        console.error('Error saving item category order:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save category order' });
    }
}

/**
 * Sending the daily report on WhatsApp: the chosen template and numbers
 * (`selected`), the templates that fit the report (`options`, approved or
 * still under review), and how many numbers are allowed.
 */
export async function getDailyReportWhatsApp(req: Request, res: Response) {
    try {
        const [selected, options] = await Promise.all([
            getDailyReportWhatsAppSettings(),
            dailyReportTemplateOptions(req.query.refresh === "1"),
        ]);
        res.status(200).json({ selected, options, maxRecipients: MAX_RECIPIENTS });
    } catch (error) {
        console.error('Error loading daily report WhatsApp settings:', error);
        res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to load the daily report settings' });
    }
}

/** Saves the daily report's WhatsApp template and numbers. */
export async function updateDailyReportWhatsApp(req: Request, res: Response) {
    try {
        res.status(200).json({ selected: await saveDailyReportWhatsAppSettings(req.body) });
    } catch (error) {
        console.error('Error saving daily report WhatsApp settings:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save the daily report settings' });
    }
}

/** How long new invoices have before they're overdue: `{ period: "month" }` or `{ period: "days", days }`. */
export async function getInvoiceDue(_req: Request, res: Response) {
    res.status(200).json({ selected: await getInvoiceDueSetting(), maxDays: MAX_DUE_DAYS });
}

export async function updateInvoiceDue(req: Request, res: Response) {
    try {
        res.status(200).json({ selected: await saveInvoiceDueSetting(req.body) });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save the overdue period' });
    }
}

/** The general items (`item_ids`): items whose unit can be changed per invoice line. */
export async function getGeneralItems(_req: Request, res: Response) {
    res.status(200).json({ item_ids: await getGeneralItemIds(), max: MAX_GENERAL_ITEMS });
}

export async function updateGeneralItems(req: Request, res: Response) {
    try {
        res.status(200).json({ item_ids: await saveGeneralItemIds(req.body?.item_ids) });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save the general items' });
    }
}
