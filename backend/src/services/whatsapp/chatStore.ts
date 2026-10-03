import { randomUUID } from "node:crypto"
import { redisClient } from "../../config/redis.js"

/**
 * WhatsApp conversation history in Redis, in the same layout the webhook
 * Lambda (wa-webhook-lambda/state/chatStore.mjs) writes inbound messages
 * with — so both read and write one shared store:
 *   chats:contacts             zset  wa_id -> last activity (ms)
 *   chats:<wa_id>:index        zset  YYYY-MM-DD -> day (ms)
 *   chats:<wa_id>:<YYYY-MM-DD> hash  message id -> message JSON
 *   chats:<wa_id>:msgday       hash  message id -> YYYY-MM-DD
 * Every message keeps a 7-day TTL. Stored messages are WhatsApp's own message
 * objects plus `direction` ("in" | "out"), `timestamp` (ms), and optionally
 * `status` / `reaction` merged in later by the Lambda.
 */

const TTL_SECONDS = 7 * 24 * 60 * 60

export type StoredChatMessage = {
    id: string
    direction: "in" | "out"
    timestamp: number
    type: string
    status?: string
    reaction?: string
    [key: string]: any
}

/** Normalizes a phone number to WhatsApp's wa_id form: digits only, with any leading "00" dropped. */
export function toWaId(phone: string): string {
    return String(phone).replace(/\D/g, "").replace(/^00/, "")
}

/** Every phone number with stored history, most recent activity first. */
export async function listChatPhones(): Promise<{ phone: string; lastActivity: number }[]> {
    const rows = await redisClient.zRangeWithScores("chats:contacts", 0, -1, { REV: true })
    return rows.map((row) => ({ phone: row.value, lastActivity: row.score }))
}

/** All stored messages for a phone number, oldest first. */
export async function getChatMessages(phone: string): Promise<StoredChatMessage[]> {
    const days = await redisClient.zRange(`chats:${phone}:index`, 0, -1)
    const messages: StoredChatMessage[] = []
    for (const day of days) {
        const hash = await redisClient.hGetAll(`chats:${phone}:${day}`)
        for (const raw of Object.values(hash)) {
            try {
                messages.push(JSON.parse(raw))
            } catch {
                // Skip a malformed entry rather than failing the whole conversation.
            }
        }
    }
    return messages.sort((a, b) => a.timestamp - b.timestamp)
}

/** The newest stored message for a phone number, reading only its latest day. */
export async function getLastChatMessage(phone: string): Promise<StoredChatMessage | undefined> {
    const [day] = await redisClient.zRange(`chats:${phone}:index`, 0, 0, { REV: true })
    if (!day) return undefined
    const hash = await redisClient.hGetAll(`chats:${phone}:${day}`)
    let latest: StoredChatMessage | undefined
    for (const raw of Object.values(hash)) {
        try {
            const message: StoredChatMessage = JSON.parse(raw)
            if (!latest || message.timestamp > latest.timestamp) latest = message
        } catch {
            // ignore malformed entry
        }
    }
    return latest
}

/** Appends one outbound message to the conversation, mirroring the Lambda's appendChatMessage. */
export async function appendOutboundChatMessage(phone: string, message: Omit<StoredChatMessage, "direction" | "timestamp">) {
    const now = Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    const stored: StoredChatMessage = { ...message, direction: "out", timestamp: now } as StoredChatMessage
    const dayKey = `chats:${phone}:${day}`
    const msgDayKey = `chats:${phone}:msgday`
    const indexKey = `chats:${phone}:index`

    await redisClient.hSet(dayKey, stored.id, JSON.stringify(stored))
    await redisClient.hSet(msgDayKey, stored.id, day)
    await redisClient.expire(dayKey, TTL_SECONDS)
    await redisClient.expire(msgDayKey, TTL_SECONDS)
    await redisClient.zAdd("chats:contacts", { score: now, value: phone })
    await redisClient.zAdd(indexKey, { score: new Date(day).getTime(), value: day })
    await redisClient.expire(indexKey, TTL_SECONDS)
    return stored
}

/**
 * Records a message the app just sent, keyed by the wa_id Meta resolved the
 * recipient to (falling back to the number as given). Never throws — a
 * history write must not turn a delivered message into a reported failure.
 */
export async function recordOutboundMessage(sendResult: any, to: string, message: Omit<StoredChatMessage, "id" | "direction" | "timestamp">) {
    try {
        const id = sendResult?.messages?.[0]?.id
        if (!id) return undefined
        const phone = sendResult?.contacts?.[0]?.wa_id ?? toWaId(to)
        return await appendOutboundChatMessage(phone, { ...message, id, status: "sent" })
    } catch (error) {
        console.error(`Failed to record outbound WhatsApp message to ${to} in chat history:`, error)
        return undefined
    }
}

/** Meta's error message off a failed Cloud API call, or the thrown Error's message. */
export function describeSendError(error: unknown): string {
    const metaError = (error as any)?.error
    if (metaError) return metaError.error_data?.details || metaError.message || "WhatsApp rejected the message"
    return error instanceof Error ? error.message : "Failed to send"
}

/**
 * Records a send that WhatsApp rejected outright (so it never got a message
 * id), as a failed message with a local id — so it still shows in the chat
 * and can be retried. Never throws.
 */
export async function recordFailedOutboundMessage(to: string, message: Omit<StoredChatMessage, "id" | "direction" | "timestamp">, error: unknown) {
    try {
        return await appendOutboundChatMessage(toWaId(to), {
            ...message,
            id: `failed-${randomUUID()}`,
            status: "failed",
            error: describeSendError(error),
        })
    } catch (storeError) {
        console.error(`Failed to record failed WhatsApp message to ${to} in chat history:`, storeError)
        return undefined
    }
}

/** Merges fields into one stored message, found via the msgday index. Returns the updated message, or undefined if it has expired. */
export async function updateChatMessage(phone: string, messageId: string, patch: Partial<StoredChatMessage>) {
    const day = await redisClient.hGet(`chats:${phone}:msgday`, messageId)
    if (!day) return undefined
    const key = `chats:${phone}:${day}`
    const raw = await redisClient.hGet(key, messageId)
    if (!raw) return undefined
    const updated = { ...JSON.parse(raw), ...patch }
    await redisClient.hSet(key, messageId, JSON.stringify(updated))
    return updated as StoredChatMessage
}

/** A short plain-text rendering of a stored message, for previews and chat bubbles. */
export function describeChatMessage(message: StoredChatMessage): string {
    switch (message.type) {
        case "text":
            return message.text?.body ?? ""
        case "template":
            return message.summary ?? `Template: ${message.template?.name ?? ""}`
        case "image":
        case "video":
        case "audio":
        case "sticker":
        case "document": {
            const label = message.type === "document"
                ? message.document?.filename || "Document"
                : message.type === "audio" && message.audio?.voice
                    ? "Voice message"
                    : message.type.charAt(0).toUpperCase() + message.type.slice(1)
            const caption = message[message.type]?.caption
            return caption ? `[${label}] ${caption}` : `[${label}]`
        }
        case "location":
            return `[Location] ${message.location?.name ?? `${message.location?.latitude ?? ""}, ${message.location?.longitude ?? ""}`}`.trim()
        case "button":
            return message.button?.text ?? "[Button]"
        case "interactive":
            return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "[Interactive]"
        case "contacts":
            return "[Contact card]"
        default:
            return `[${message.type ?? "Message"}]`
    }
}
