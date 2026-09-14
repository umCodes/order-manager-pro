import type { Request, Response } from 'express';
import { listRecentWhatsAppMessages } from '../../services/whatsapp/log.js';

/**
 * Lists WhatsApp notifications sent through this app in the last 7 days,
 * with each one's delivery status as last reported by Meta's status
 * webhook (sent/delivered/read/failed) — see wa-webhook.controller.ts's
 * processStatusUpdate for where that gets applied.
 */
export async function listWhatsAppMessages(req: Request, res: Response) {
    try {
        const messages = await listRecentWhatsAppMessages();
        res.status(200).json({ messages });
    } catch (error) {
        console.error('Error listing WhatsApp messages:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list WhatsApp messages' });
        return
    }
}
