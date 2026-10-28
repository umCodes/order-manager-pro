import { getRedisClient } from "../services/redis/client.mjs";

/**
 * Which order each message in the preparers' group is — saved by the backend
 * when it posts an order, a changes reply or a backup list there
 * (backend/src/services/telegram/groupOrders.ts has the shape; change both
 * together). Replies recognised as replies to one are kept here too: the
 * latest RECENT_LIMIT, newest first, for a week.
 */
const RECENT_KEY = "telegram:group-replies:recent";
const RECENT_LIMIT = 200;
const RECENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** The order a group message is, or null when it isn't one the app posted (or it's past 30 days). */
export async function readGroupOrderMessage(messageId) {
    const raw = await getRedisClient().get(`telegram:group-order:${messageId}`);
    return raw ? JSON.parse(raw) : null;
}

export async function recordGroupReply(reply) {
    await getRedisClient()
        .multi()
        .lpush(RECENT_KEY, JSON.stringify(reply))
        .ltrim(RECENT_KEY, 0, RECENT_LIMIT - 1)
        .expire(RECENT_KEY, RECENT_TTL_SECONDS)
        .exec();
}
