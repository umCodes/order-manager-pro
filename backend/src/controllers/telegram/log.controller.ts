import type { Request, Response } from 'express';
import {
    TelegramEditMessage,
    TelegramDeleteMessage,
    listTelegramMessages,
} from '../../services/telegram/index.js';
import { removeBackupListByMessage } from '../../services/backupLists.js';
import { readGroupOrderMessage, listRecognisedGroupReplies, orderShortages, orderPreparation } from '../../services/telegram/groupOrders.js';

/**
 * Lists every message sent to the Telegram channel through this app in the
 * last week, newest first. The Bot API has no way to retrieve a channel's full history, so
 * this can only ever cover messages the app itself sent, edited, or deleted
 * — not messages posted by anyone else.
 */
export async function listMessages(req: Request, res: Response) {
    try {
        const messages = await listTelegramMessages();
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

/**
 * Deletes a message from the channel and drops it from the log. Succeeds as
 * long as the log entry is gone: when Telegram refuses the channel delete,
 * `deleted_from_telegram` is false and `telegram_error` says why.
 */
export async function deleteMessage(req: Request, res: Response) {
    try {
        const messageId = req.params.messageId;

        if (!messageId) throw new Error("messageId not provided")

        const { deletedFromTelegram, error } = await TelegramDeleteMessage(Number(messageId));
        // A backup list's message going means the list is done with too.
        await removeBackupListByMessage(Number(messageId)).catch((err) => console.error('Error removing backup list for deleted message:', err));
        res.status(200).json({ ok: true, deleted_from_telegram: deletedFromTelegram, telegram_error: error });
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

/**
 * For checking the group links (no Telegram changes): which order a group
 * message is and the numbered items it shows, and the latest replies the
 * webhook recognised as replies to an order message.
 */
export async function getGroupOrderMessage(req: Request, res: Response) {
    try {
        const messageId = Number(req.params.messageId);
        if (!Number.isInteger(messageId)) throw new Error("messageId must be a number")
        const order = await readGroupOrderMessage(messageId);
        if (!order) {
            res.status(404).json({ error: `Group message ${messageId} isn't linked to an order` });
            return
        }
        res.status(200).json({ order });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read the group message' });
    }
}

export async function listGroupReplies(req: Request, res: Response) {
    try {
        res.status(200).json({ replies: await listRecognisedGroupReplies() });
    } catch (error) {
        console.error('Error listing group replies:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list group replies' });
    }
}

/** An order's (invoice id or BK- id) shortages as reported in the group — empty when there are none. */
export async function getOrderShortages(req: Request, res: Response) {
    try {
        const orderId = req.params.orderId;
        if (!orderId) throw new Error("orderId not provided")
        res.status(200).json(await orderShortages(String(orderId)));
    } catch (error) {
        console.error('Error reading order shortages:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read the shortages' });
    }
}

/** An order's preparation (invoice id or BK- id): its status, who confirmed it, and its shortages. */
export async function getOrderPreparation(req: Request, res: Response) {
    try {
        const orderId = req.params.orderId;
        if (!orderId) throw new Error("orderId not provided")
        res.status(200).json(await orderPreparation(String(orderId)));
    } catch (error) {
        console.error('Error reading order preparation:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read the preparation' });
    }
}

/** Several orders' preparation status at once, for the drafts list: `?ids=a,b,c` → { statuses: { id: { status, confirmed } } }. */
export async function listOrderPreparationStatuses(req: Request, res: Response) {
    try {
        const ids = String(req.query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 300);
        const results = await Promise.all(ids.map((id) => orderPreparation(id)));
        res.status(200).json({
            statuses: Object.fromEntries(results.map(({ order_id, status, confirmed }) => [order_id, { status, confirmed }])),
        });
    } catch (error) {
        console.error('Error reading preparation statuses:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read the statuses' });
    }
}
