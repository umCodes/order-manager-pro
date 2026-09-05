import type { Request, Response } from 'express';
import {
    TelegramEditMessage,
    TelegramDeleteMessage,
    listRecentTelegramMessages,
} from '../../services/telegram/index.js';

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

/** Rewrites a message already posted to the channel, in place. */
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

/** Deletes a message from the channel and drops it from the log. */
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
