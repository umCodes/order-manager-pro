import type { Request, Response } from 'express';
import {
    TelegramSendMessage,
    TelegramReplyToMessage,
    TelegramEditMessage,
    TelegramDeleteMessage,
    listRecentTelegramMessages,
} from '../services/telegram/index.js';
import { ZohoGetInvoiceById } from '../services/zoho/invoices.js';
import { redisClient } from '../config/redis.js';

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

export async function replyToMessage(req: Request, res: Response) {
    try {
        const { text, invoice_id } = req.body;
        const access_token = req.headers["Authorization"];

        if (!text) throw new Error("Text not provided")
        if (!invoice_id) throw new Error("invoice_id not provided")

        const message_id = await redisClient.get(String(invoice_id));

        if (!message_id) {
            if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting the invoice");

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

/**
 * Lists messages sent to the Telegram channel through this app in the last
 * 72 hours. The Bot API has no way to retrieve a channel's full history, so
 * this can only ever cover messages the app itself sent, edited, or deleted
 * — not messages posted by anyone else.
 */
export async function listMessages(req: Request, res: Response) {
    try {
        const messages = await listRecentTelegramMessages();
        res.status(200).json({ messages });
    } catch (error) {
        console.error('Error listing messages:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list messages' });
        return
    }
}

export async function editMessage(req: Request, res: Response) {
    try {
        const { text } = req.body ?? {};
        const messageId = req.params.messageId;

        if (!text) throw new Error("Text not provided")
        if (!messageId) throw new Error("messageId not provided")

        const message = await TelegramEditMessage(text, Number(messageId));
        res.status(200).json({ message });
        return
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to edit message' });
        console.error('Error editing message:', error);
        return
    }
}

export async function deleteMessage(req: Request, res: Response) {
    try {
        const messageId = req.params.messageId;

        if (!messageId) throw new Error("messageId not provided")

        await TelegramDeleteMessage(Number(messageId));
        res.status(200).json({ ok: true });
        return
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to delete message' });
        console.error('Error deleting message:', error);
        return
    }
}
