import { getRedisClient } from "../services/redis/client.mjs";

/**
 * Devices subscribed to push notifications, written by the backend
 * (backend/src/services/push/subscriptions.ts) in the same layout:
 * hash field = subscription endpoint, value = subscription JSON.
 */
const SUBSCRIPTIONS_KEY = "push:subscriptions";

export async function listPushSubscriptions() {
    const entries = await getRedisClient().hgetall(SUBSCRIPTIONS_KEY);
    return Object.values(entries ?? {}).flatMap((raw) => {
        try {
            return [JSON.parse(raw)];
        } catch {
            return [];
        }
    });
}

export async function removePushSubscription(endpoint) {
    await getRedisClient().hdel(SUBSCRIPTIONS_KEY, endpoint);
}
