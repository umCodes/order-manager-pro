import type { Request, Response } from 'express';
import {
    defaultNotificationTemplates,
    getNotificationTemplateSettings,
    notificationTemplateOptions,
    saveNotificationTemplateSettings,
} from '../services/whatsapp/notificationTemplates.js';

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
