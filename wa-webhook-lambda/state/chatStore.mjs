import { getRedisClient } from "../services/redis/client.mjs";

const TTL_SECONDS = 7 * 24 * 60 * 60;

function dayKey(phoneNumber, date) {
    return `chats:${phoneNumber}:${date}`;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function msgDayIndexKey(phoneNumber) {
    return `chats:${phoneNumber}:msgday`;
}

/** Appends one message to `phoneNumber`'s conversation for today, (re)setting the 7-day TTL. */
export async function appendChatMessage(phoneNumber, message) {
    const client = getRedisClient();
    const date = today();
    const key = dayKey(phoneNumber, date);

    await client.hset(key, message.id, JSON.stringify(message));
    await client.hset(msgDayIndexKey(phoneNumber), message.id, date);
    await client.expire(key, TTL_SECONDS);
    await client.expire(msgDayIndexKey(phoneNumber), TTL_SECONDS);
    await client.zadd("chats:contacts", Date.now(), phoneNumber);
    await client.zadd(`chats:${phoneNumber}:index`, new Date(date).getTime(), date);
    await client.expire(`chats:${phoneNumber}:index`, TTL_SECONDS);
}

/**
 * Merges a delivery/read status update into the original message it refers
 * to, looking up which day-hash it lives in via the msgday index. No-ops if
 * the original message has already expired out of Redis.
 */
export async function applyChatStatus(phoneNumber, messageId, status) {
    const client = getRedisClient();
    const date = await client.hget(msgDayIndexKey(phoneNumber), messageId);
    if (!date) return;

    const key = dayKey(phoneNumber, date);
    const raw = await client.hget(key, messageId);
    if (!raw) return;

    const message = JSON.parse(raw);
    message.status = status;
    await client.hset(key, messageId, JSON.stringify(message));
}

/**
 * Merges an inbound reaction onto the message it reacted to. WhatsApp sends
 * reactions as a message of type "reaction" whose `reaction.message_id`
 * points at the original message; an empty `emoji` means the reaction was
 * removed.
 */
export async function applyChatReaction(phoneNumber, targetMessageId, emoji) {
    const client = getRedisClient();
    const date = await client.hget(msgDayIndexKey(phoneNumber), targetMessageId);
    if (!date) return;

    const key = dayKey(phoneNumber, date);
    const raw = await client.hget(key, targetMessageId);
    if (!raw) return;

    const message = JSON.parse(raw);
    if (emoji) {
        message.reaction = emoji;
    } else {
        delete message.reaction;
    }
    await client.hset(key, targetMessageId, JSON.stringify(message));
}
