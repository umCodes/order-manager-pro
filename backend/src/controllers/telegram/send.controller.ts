import type { Request, Response } from 'express';
import { TelegramSendMessage, TelegramReplyToMessage } from '../../services/telegram/index.js';
import { ZohoGetInvoiceById } from '../../services/zoho/invoices/index.js';
import { redisClient } from '../../config/redis.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import { itemsListMessageText } from '../../services/telegram/invoices/messageText.js';
import { sortLineItemsByCategory } from '../../services/lineItemOrder.js';
import { excludeInternalLineItems } from '../../utils/internalLineItems.js';

/** Posts a free-text message to the team's channel. */
export async function sendMessage(req: Request, res: Response) {
    try {
        const { text } = req.body;

        if (!text) throw new Error("Text not provided")

        const message = await TelegramSendMessage(text);
        res.status(201).json({ message });
        return
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to send message' });
        console.error('Error sending message:', error);
        return
    }
}

/**
 * Posts a list of items to the channel without creating an invoice (the
 * Invoice tab's "Items Only" mode). Takes the same `line_items` shape as
 * invoice creation, sorted by category the same way; lines marked internal
 * ("###") are left out. Nothing is written to Zoho.
 */
export async function sendItemsList(req: Request, res: Response) {
    try {
        const { line_items, date } = req.body ?? {};
        if (!Array.isArray(line_items) || line_items.length === 0) throw new Error("line_items (non-empty array) are required")
        if (date !== undefined && typeof date !== "string") throw new Error("date must be a string")

        const access_token = requireAccessToken(req, "A problem occured getting items");
        const sorted = await sortLineItemsByCategory(access_token, line_items);
        const visibleItems = excludeInternalLineItems(sorted);
        if (visibleItems.length === 0) throw new Error("Every item is excluded from Telegram, so there's nothing to send")

        const message = await TelegramSendMessage(itemsListMessageText(visibleItems, date || undefined));
        res.status(201).json({ message });
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to send items list' });
        console.error('Error sending items list:', error);
    }
}

/**
 * Posts a message as a reply to an invoice's own channel message, so it lands
 * in that invoice's thread. When we have no message id on file for the
 * invoice (never sent, or expired), falls back to a standalone message with
 * the invoice number appended so the team can still tell what it refers to.
 */
export async function replyToMessage(req: Request, res: Response) {
    try {
        const { text, invoice_id } = req.body;

        if (!text) throw new Error("Text not provided")
        if (!invoice_id) throw new Error("invoice_id not provided")

        const message_id = await redisClient.get(String(invoice_id));

        if (!message_id) {
            const access_token = requireAccessToken(req, "A problem occured getting the invoice");

            const invoice = await ZohoGetInvoiceById(access_token, String(invoice_id));
            const fallbackText = `${text}\n\n${invoice.invoice_number}`;

            const message = await TelegramSendMessage(fallbackText);
            res.status(201).json({ message });
            return
        }

        const message = await TelegramReplyToMessage(text, Number(message_id));
        res.status(201).json({ message });
        return
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to reply to message' });
        console.error('Error replying to message:', error);
        return
    }
}
