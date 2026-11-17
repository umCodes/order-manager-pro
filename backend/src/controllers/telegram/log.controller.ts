import type { Request, Response } from 'express';
import {
    TelegramEditMessage,
    TelegramDeleteMessage,
    listTelegramMessages,
} from '../../services/telegram/index.js';
import { removeBackupListByMessage } from '../../services/backupLists.js';
import { confirmOrderLoading, orderLoadingView, readOrderLoading, setItemLoading, undoOrderLoading, type OrderLoading } from '../../services/telegram/loading.js';
import { readGroupOrderMessage, listRecognisedGroupReplies, orderShortages, orderPreparation, recordAppliedReport } from '../../services/telegram/groupOrders.js';

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

/** Several orders' preparation at once, for the drafts list and the Items tab: `?ids=a,b,c` → { statuses: { id: { status, confirmed, items } } }. */
export async function listOrderPreparationStatuses(req: Request, res: Response) {
    try {
        const ids = String(req.query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 300);
        const results = await Promise.all(
            ids.map(async (id) => ({ ...(await orderPreparation(id)), loading: loadingSummary(await readOrderLoading(id).catch(() => null)) })),
        );
        res.status(200).json({
            statuses: Object.fromEntries(results.map(({ order_id, status, confirmed, items, loading }) => [order_id, { status, confirmed, items, loading }])),
        });
    } catch (error) {
        console.error('Error reading preparation statuses:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read the statuses' });
    }
}

/**
 * Records that an order's item was set to what the preparers reported (after
 * the app saved that change to the invoice), so it stops showing as short:
 * body { item_key, quantity, unit }. Changes nothing in Zoho itself.
 */
export async function postAppliedReport(req: Request, res: Response) {
    try {
        const orderId = req.params.orderId;
        const { item_key, quantity, unit } = req.body ?? {};
        if (!orderId) throw new Error("orderId not provided")
        if (typeof item_key !== "string" || !item_key) throw new Error("item_key is required")
        if (typeof quantity !== "number" || quantity < 0) throw new Error("quantity must be a number, 0 or more")
        const applied = await recordAppliedReport(String(orderId), item_key, quantity, String(unit ?? ""));
        res.status(200).json({ applied });
    } catch (error) {
        console.error('Error recording an applied report:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to record the change' });
    }
}

/** What a list needs to show an order's loading: when, and whether anything was short. */
export function loadingSummary(loading: OrderLoading | null) {
    if (!loading) return null
    const short = loading.items.filter((item) => item.received < item.ordered).length
    return { at: loading.at, mode: loading.mode, short_items: short, confirmed_items: loading.items.length }
}

/** An order's loading (invoice id or BK- id): its current items, the loading if confirmed, and what changed since. */
export async function getOrderLoading(req: Request, res: Response) {
    try {
        res.status(200).json(await orderLoadingView(String(req.params.orderId)));
    } catch (error) {
        console.error('Error reading order loading:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read the loading' });
    }
}

/**
 * Confirms (or changes) what was loaded for an order: body { mode: "as_reported" }
 * or { mode: "checked", received: { <item key>: quantity } } (in each item's
 * own unit). Saved in Redis and marked on the order's group messages only.
 */
export async function postOrderLoading(req: Request, res: Response) {
    try {
        const { mode, received } = req.body ?? {};
        if (mode !== "as_reported" && mode !== "checked") throw new Error('mode must be "as_reported" or "checked"')
        if (mode === "checked" && (typeof received !== "object" || received === null)) throw new Error("received is required")
        const result = await confirmOrderLoading(String(req.params.orderId), mode, mode === "checked" ? received : {});
        res.status(200).json({ ...(await orderLoadingView(String(req.params.orderId))), telegram: result.telegram });
    } catch (error) {
        console.error('Error confirming order loading:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to confirm the loading' });
    }
}

/** Takes an order's loading back, and removes its marks from the group messages. */
export async function deleteOrderLoading(req: Request, res: Response) {
    try {
        const result = await undoOrderLoading(String(req.params.orderId));
        res.status(200).json({ ...(await orderLoadingView(String(req.params.orderId))), telegram: result.telegram });
    } catch (error) {
        console.error('Error undoing order loading:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to undo the loading' });
    }
}

/**
 * Confirms one item of an order: body { item_key, received } — what was
 * received in the item's own unit (its full quantity when complete, 0 when
 * missing), or received null to clear it.
 */
export async function postItemLoading(req: Request, res: Response) {
    try {
        const { item_key, received } = req.body ?? {};
        if (typeof item_key !== "string" || !item_key) throw new Error("item_key is required")
        if (received !== null && typeof received !== "number") throw new Error("received must be a number or null")
        const result = await setItemLoading(String(req.params.orderId), item_key, received);
        res.status(200).json({ ...(await orderLoadingView(String(req.params.orderId))), telegram: result.telegram });
    } catch (error) {
        console.error('Error confirming an item\'s loading:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to confirm the item' });
    }
}

/** Several orders' loading at once (for the Items tab): `?ids=a,b,c` → { loadings: { id: view } }. */
export async function listOrderLoadings(req: Request, res: Response) {
    try {
        const ids = String(req.query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 300);
        const views = await Promise.all(ids.map((id) => orderLoadingView(id)));
        res.status(200).json({ loadings: Object.fromEntries(views.map((view) => [view.order_id, view])) });
    } catch (error) {
        console.error('Error reading loadings:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read the loadings' });
    }
}
