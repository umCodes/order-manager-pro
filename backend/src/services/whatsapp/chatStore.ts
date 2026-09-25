import { redisClient } from "../../config/redis.js"

/**
 * Writes outbound messages into the WhatsApp chat history that the webhook
 * Lambda keeps in Redis (see wa-webhook-lambda/state/chatStore.mjs), so a
 * chat interface reading that history also sees what this app sent. The key
 * layout, TTL and date handling must stay identical to the Lambda's.
 */

const TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Normalizes a phone number to WhatsApp's wa_id form: digits only, country
 * code first, no '+' and no international '00' prefix. Zoho numbers are
 * stored as "+<country code><number>" (with or without spaces/dashes), so
 * "+966 50-123 4567" becomes "966501234567" — the same form Meta uses in
 * webhook `from`/`recipient_id` fields.
 */
export function normalizeWaPhone(phone: string): string {
    return String(phone).replace(/\D/g, "").replace(/^00/, "")
}

/** Appends one message to `phone`'s conversation for today (UTC), mirroring the Lambda's appendChatMessage. */
export async function appendChatMessage(phone: string, message: { id: string } & Record<string, unknown>) {
    const waId = normalizeWaPhone(phone)
    const date = new Date().toISOString().slice(0, 10)
    const dayKey = `chats:${waId}:${date}`
    const msgDayKey = `chats:${waId}:msgday`
    const indexKey = `chats:${waId}:index`

    await redisClient
        .multi()
        .hSet(dayKey, message.id, JSON.stringify(message))
        .hSet(msgDayKey, message.id, date)
        .expire(dayKey, TTL_SECONDS)
        .expire(msgDayKey, TTL_SECONDS)
        .zAdd("chats:contacts", { score: Date.now(), value: waId })
        .zAdd(indexKey, { score: new Date(date).getTime(), value: date })
        .expire(indexKey, TTL_SECONDS)
        .exec()
}
