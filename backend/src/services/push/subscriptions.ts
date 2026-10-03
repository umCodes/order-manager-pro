import { redisClient } from "../../config/redis.js"

/**
 * Devices that asked for push notifications of inbound WhatsApp messages.
 * Stored in Redis (hash field = the subscription's endpoint URL, so the same
 * device re-subscribing just overwrites itself). The webhook Lambda reads the
 * same hash to send the pushes, and removes subscriptions the push service
 * reports as gone — keep this layout in sync with
 * wa-webhook-lambda/state/pushSubscriptions.mjs.
 */
const SUBSCRIPTIONS_KEY = "push:subscriptions"

/** Plenty for a small team's phones; stops the hash being flooded through the open API. */
const MAX_SUBSCRIPTIONS = 50

/**
 * Push services run by the browsers themselves (Chrome/Android, Safari/iOS,
 * Firefox, Edge). The Lambda POSTs to whatever endpoint is stored, so only
 * these hosts are accepted — never an arbitrary URL.
 */
const ALLOWED_PUSH_HOSTS = [
    /^fcm\.googleapis\.com$/,
    /(^|\.)push\.apple\.com$/,
    /(^|\.)push\.services\.mozilla\.com$/,
    /(^|\.)notify\.windows\.com$/,
]

export type PushSubscriptionRecord = {
    endpoint: string
    keys: { p256dh: string; auth: string }
}

/** Validates a browser PushSubscription (its toJSON() shape), throwing a readable error. */
export function parsePushSubscription(body: any): PushSubscriptionRecord {
    const endpoint = body?.endpoint
    const p256dh = body?.keys?.p256dh
    const auth = body?.keys?.auth
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
        throw new Error("Invalid push subscription")
    }
    let url: URL
    try {
        url = new URL(endpoint)
    } catch {
        throw new Error("Invalid push subscription endpoint")
    }
    if (url.protocol !== "https:" || !ALLOWED_PUSH_HOSTS.some((host) => host.test(url.hostname))) {
        throw new Error("Unsupported push service")
    }
    return { endpoint, keys: { p256dh, auth } }
}

export async function savePushSubscription(subscription: PushSubscriptionRecord) {
    const exists = await redisClient.hExists(SUBSCRIPTIONS_KEY, subscription.endpoint)
    if (!exists && (await redisClient.hLen(SUBSCRIPTIONS_KEY)) >= MAX_SUBSCRIPTIONS) {
        throw new Error("Too many devices are subscribed to notifications")
    }
    await redisClient.hSet(
        SUBSCRIPTIONS_KEY,
        subscription.endpoint,
        JSON.stringify({ ...subscription, created_at: Date.now() }),
    )
}

export async function deletePushSubscription(endpoint: string) {
    await redisClient.hDel(SUBSCRIPTIONS_KEY, endpoint)
}
