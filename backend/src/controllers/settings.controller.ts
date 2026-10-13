import type { Request, Response } from 'express';
import {
    defaultNotificationTemplates,
    getNotificationTemplateSettings,
    notificationTemplateOptions,
    saveNotificationTemplateSettings,
} from '../services/whatsapp/notificationTemplates.js';
import { getItemCategoryOrder, saveItemCategoryOrder } from '../services/itemCategoryOrder.js';
import { catalogCategories, getCatalogItems } from '../services/zoho/items.js';

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
 */
export async function getItemCategories(req: Request, res: Response) {
    const access_token = req.headers["Authorization"]
    try {
        if (!access_token || access_token instanceof Array) throw new Error("Missing Zoho access token")
        const [order, catalog] = await Promise.all([getItemCategoryOrder(), getCatalogItems(access_token)])
        res.status(200).json({ order, categories: catalogCategories(catalog) });
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
