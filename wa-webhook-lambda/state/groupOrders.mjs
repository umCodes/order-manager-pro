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

/** Who has a 👍 on a message now: reactor ids (a saved report's own 👍 is "report:<report message id>"). */
export async function thumbsOn(messageId) {
    return getRedisClient().hkeys(thumbsKey(messageId));
}

/**
 * Interactions with a backup list's message: anyone replying to it or
 * reacting to it (any emoji) has seen to the list, so the list counts as
 * reported. Per message, who and when (their latest). The backend reads
 * these (backend/src/services/telegram/groupOrders.ts; change both together).
 *
 *   telegram:group-interactions:<group message id> → hash of person id → { name, at, kind } (JSON)
 */
export async function recordInteraction(messageId, personId, interaction) {
    const key = `telegram:group-interactions:${messageId}`;
    await getRedisClient()
        .multi()
        .hset(key, String(personId), JSON.stringify(interaction))
        .expire(key, REPORT_KEEP_SECONDS)
        .exec();
}

/**
 * The message chain around a report, so it can be deleted as a whole: every
 * reply to an order message (a report, a wrong one, or a plain reply), the
 * bot's warnings answering it, and each warning's report. Kept 30 days.
 *
 *   telegram:group-reply-of:<message id>      → { chat_id, order_message_id } (JSON)
 *   telegram:group-bot-replies:<message id>   → set of the bot's warning message ids
 *   telegram:group-bot-reply-of:<warning id>  → the message it answered
 */
export async function trackReplyToOrder(messageId, chatId, orderMessageId) {
    await getRedisClient().set(
        `telegram:group-reply-of:${messageId}`,
        JSON.stringify({ chat_id: String(chatId), order_message_id: orderMessageId }),
        "EX",
        REPORT_KEEP_SECONDS,
    );
}

export async function readReplyToOrder(messageId) {
    const raw = await getRedisClient().get(`telegram:group-reply-of:${messageId}`);
    return raw ? JSON.parse(raw) : null;
}

export async function addBotReply(messageId, warningId) {
    await getRedisClient()
        .multi()
        .sadd(`telegram:group-bot-replies:${messageId}`, String(warningId))
        .expire(`telegram:group-bot-replies:${messageId}`, REPORT_KEEP_SECONDS)
        .set(`telegram:group-bot-reply-of:${warningId}`, String(messageId), "EX", REPORT_KEEP_SECONDS)
        .exec();
}

export async function botRepliesTo(messageId) {
    return (await getRedisClient().smembers(`telegram:group-bot-replies:${messageId}`)).map(Number);
}

export async function messageAnsweredBy(warningId) {
    const id = await getRedisClient().get(`telegram:group-bot-reply-of:${warningId}`);
    return id ? Number(id) : null;
}

export async function forgetBotReplies(messageId, warningIds) {
    const redis = getRedisClient();
    await redis.del(`telegram:group-bot-replies:${messageId}`, ...warningIds.map((id) => `telegram:group-bot-reply-of:${id}`));
}

/**
 * ❤️ on an order message: everything on it is missing. Per message, who has
 * one on it now and since when (the backend reads these:
 * backend/src/services/telegram/groupOrders.ts; change both together).
 *
 *   telegram:group-all-missing:<group message id> → hash of reactor id → { name, at } (JSON)
 */
const allMissingKey = (messageId) => `telegram:group-all-missing:${messageId}`;

export async function setAllMissing(messageId, reactorId, mark) {
    await getRedisClient()
        .multi()
        .hset(allMissingKey(messageId), String(reactorId), JSON.stringify(mark))
        .expire(allMissingKey(messageId), REPORT_KEEP_SECONDS)
        .exec();
}

export async function removeAllMissing(messageId, reactorId) {
    await getRedisClient().hdel(allMissingKey(messageId), String(reactorId));
}
