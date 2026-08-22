import type { Request, Response } from 'express';
import { TelegramSendMessage, TelegramReplyToMessage } from '../services/telegram/index.js';
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
