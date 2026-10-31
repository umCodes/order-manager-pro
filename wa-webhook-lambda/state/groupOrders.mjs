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

/**
 * Shortage reports: one record per report message in the group (its latest
 * text and the item lines it holds, plus every earlier version), and per
 * order the set of its report messages. Kept 30 days, like the orders' own
 * records. The backend reads them to show each order's shortages
 * (backend/src/services/telegram/groupOrders.ts; change both together).
 *
 *   telegram:group-report:<report message id> → GroupReport (JSON)
 *   telegram:group-reports:<order id>         → set of report message ids
 *   telegram:group-order-messages:<order id>  → the order's group message ids, oldest first (written by the backend)
 */
const REPORT_KEEP_SECONDS = 30 * 24 * 60 * 60;
const reportKey = (messageId) => `telegram:group-report:${messageId}`;
const orderReportsKey = (orderId) => `telegram:group-reports:${orderId}`;

export async function readGroupReport(messageId) {
    const raw = await getRedisClient().get(reportKey(messageId));
    return raw ? JSON.parse(raw) : null;
}

export async function saveGroupReport(report) {
    await getRedisClient()
        .multi()
        .set(reportKey(report.message_id), JSON.stringify(report), "EX", REPORT_KEEP_SECONDS)
        .sadd(orderReportsKey(report.order_id), String(report.message_id))
        .expire(orderReportsKey(report.order_id), REPORT_KEEP_SECONDS)
        .exec();
}

/** The order's group messages (records, oldest first) — to tell whether a message has been replaced by a newer full one. */
export async function readOrderGroupMessages(orderId) {
    const redis = getRedisClient();
    const ids = await redis.lrange(`telegram:group-order-messages:${orderId}`, 0, -1);
    if (ids.length === 0) return [];
    const raw = await redis.mget(ids.map((id) => `telegram:group-order:${id}`));
    return raw.filter(Boolean).map((entry) => JSON.parse(entry));
}

/**
 * 👍 on order messages: per order message, who has one on it now and since
 * when (the backend reads these to tell an order is prepared:
 * backend/src/services/telegram/groupOrders.ts; change both together).
 *
 *   telegram:group-thumbs:<group message id> → hash of reactor id → { name, at } (JSON)
 */
const thumbsKey = (messageId) => `telegram:group-thumbs:${messageId}`;

export async function setThumb(messageId, reactorId, thumb) {
    await getRedisClient()
        .multi()
        .hset(thumbsKey(messageId), String(reactorId), JSON.stringify(thumb))
        .expire(thumbsKey(messageId), REPORT_KEEP_SECONDS)
        .exec();
}

export async function removeThumb(messageId, reactorId) {
    await getRedisClient().hdel(thumbsKey(messageId), String(reactorId));
}
