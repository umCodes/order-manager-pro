import type { Request, Response } from 'express';
import { ENV } from '../constants/env.js';
import {
    deletePushSubscription,
    parsePushSubscription,
    savePushSubscription,
} from '../services/push/subscriptions.js';

/**
 * The VAPID public key the browser needs to subscribe. Push is optional:
 * without the key configured this returns 404 and the app hides the option.
 */
export function getPushPublicKey(req: Request, res: Response) {
    if (!ENV.WEB_PUSH_PUBLIC_KEY) {
        res.status(404).json({ error: 'Push notifications are not configured' });
        return
    }
    res.json({ public_key: ENV.WEB_PUSH_PUBLIC_KEY });
}

/** Registers (or refreshes) this device for inbound-message notifications. */
export async function subscribeToPush(req: Request, res: Response) {
    try {
        await savePushSubscription(parsePushSubscription(req.body));
        res.status(201).json({ ok: true });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to enable notifications' });
    }
}

/** Stops notifications for this device. */
export async function unsubscribeFromPush(req: Request, res: Response) {
    try {
        const endpoint = req.body?.endpoint;
        if (typeof endpoint !== 'string') throw new Error('endpoint is required');
        await deletePushSubscription(endpoint);
        res.json({ ok: true });
    } catch (error) {
        console.error('Error removing push subscription:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to turn off notifications' });
    }
}
