import { getRedisClient } from "../services/redis/client.mjs";

/**
 * Telegram updates received by the webhook. Telegram resends an update
 * until it gets a 2xx, so each update_id is claimed once (kept a day) and
 * a repeat is ignored. The latest RECENT_LIMIT updates are kept as they
 * came, newest first, for a week — the record of what the chat actually
 * sends (message, channel_post, message_reaction, …).
 */
const RECENT_KEY = "telegram:updates:recent";
const RECENT_LIMIT = 200;
const RECENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const SEEN_TTL_SECONDS = 24 * 60 * 60;

/** True the first time an update_id is seen; false for Telegram's repeat sends. */
export async function claimUpdate(updateId) {
    const claimed = await getRedisClient().set(`telegram:update:${updateId}`, "1", "EX", SEEN_TTL_SECONDS, "NX");
    return claimed === "OK";
}

export async function recordUpdate(update) {
    const redis = getRedisClient();
    await redis
        .multi()
        .lpush(RECENT_KEY, JSON.stringify({ received_at: new Date().toISOString(), update }))
        .ltrim(RECENT_KEY, 0, RECENT_LIMIT - 1)
        .expire(RECENT_KEY, RECENT_TTL_SECONDS)
        .exec();
}
