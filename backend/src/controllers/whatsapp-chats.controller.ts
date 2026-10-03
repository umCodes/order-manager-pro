import type { Request, Response } from 'express';
import { ZohoGetCustomersCached, findCustomerByPhone } from '../services/zoho/customers/index.js';
import {
    describeChatMessage,
    getChatMessages,
    getLastChatMessage,
    listChatPhones,
    toWaId,
    type StoredChatMessage,
} from '../services/whatsapp/chatStore.js';
import { replyToWhatsAppMessage } from '../services/whatsapp/messages.js';
import { requireAccessToken } from '../utils/requireAccessToken.js';
import { getCache, setTTLCache } from '../utils/cache.js';

/** WhatsApp only accepts free-form (non-template) messages within 24h of the customer's last message. */
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_TEXT_LENGTH = 4096
const UNKNOWN_SENDER_NAME_TTL_SECONDS = 12 * 60 * 60

type ChatPreview = { text: string; timestamp: number; direction: "in" | "out" }

type ChatListEntry = {
    phone: string
    name: string
    customer_id?: string
    last_message?: ChatPreview
}

/** Last 9 digits — tolerates country-code / leading-zero differences, same as findCustomerByPhone. */
function phoneMatchKey(phone: string) {
    return toWaId(phone).replace(/^0/, "").slice(-9)
}

function toPreview(message: StoredChatMessage | undefined): ChatPreview | undefined {
    if (!message) return undefined
    return { text: describeChatMessage(message), timestamp: message.timestamp, direction: message.direction }
}

function toMessageView(message: StoredChatMessage) {
    return {
        id: message.id,
        direction: message.direction,
        timestamp: message.timestamp,
        type: message.type,
        text: describeChatMessage(message),
        ...(message.status && { status: message.status }),
        ...(message.reaction && { reaction: message.reaction }),
    }
}

/** Phone path params are wa_ids: digits only. */
function readPhoneParam(req: Request) {
    const phone = toWaId(String(req.params.phone ?? ""))
    if (phone.length < 7) throw new Error("A valid phone number is required")
    return phone
}

/** Names a chat whose number isn't any customer's main phone (e.g. a secondary contact person), cached per number. */
async function resolveUnknownSender(accessToken: string, phone: string): Promise<{ name: string; customer_id?: string }> {
    const cacheKey = `wa-chat-sender:${phone}`
    const cached = getCache(cacheKey)
    if (cached) return cached

    let resolved: { name: string; customer_id?: string } = { name: `+${phone}` }
    try {
        const match = await findCustomerByPhone(accessToken, phone)
        if (match) {
            const customerName = match.contact?.contact_name || match.contact?.company_name || `+${phone}`
            resolved = {
                name: match.contactPerson?.first_name ? `${customerName} (${match.contactPerson.first_name})` : customerName,
                customer_id: String(match.contact?.contact_id),
            }
        }
    } catch (error) {
        console.error(`Failed to resolve WhatsApp sender ${phone} to a customer:`, error)
        return resolved
    }
    setTTLCache(cacheKey, resolved, UNKNOWN_SENDER_NAME_TTL_SECONDS)
    return resolved
}

/**
 * Every customer with a phone number on file, plus any other number with
 * stored WhatsApp history, like a messaging app's chat list: conversations
 * with history first (most recent first), then the rest alphabetically.
 * Customers are matched to stored conversations by phone number.
 */
export async function getWhatsAppChats(req: Request, res: Response) {
    try {
        const access_token = requireAccessToken(req, "A problem occured loading WhatsApp chats")

        const [customers, chatPhones] = await Promise.all([
            ZohoGetCustomersCached(access_token) as Promise<any[]>,
            // Without history (Redis down), still list the customers.
            listChatPhones().catch((error) => {
                console.error('Failed to read WhatsApp chat history:', error)
                return [] as Awaited<ReturnType<typeof listChatPhones>>
            }),
        ])

        const chatByMatchKey = new Map(chatPhones.map((c) => [phoneMatchKey(c.phone), c.phone]))
        const matchedChatPhones = new Set<string>()
        const entries: ChatListEntry[] = []

        for (const customer of customers) {
            const rawPhone = customer?.mobile || customer?.phone
            if (!rawPhone) continue
            const chatPhone = chatByMatchKey.get(phoneMatchKey(rawPhone))
            if (!chatPhone && customer.status && customer.status !== "active") continue
            if (chatPhone) matchedChatPhones.add(chatPhone)
            entries.push({
                phone: chatPhone ?? toWaId(rawPhone),
                name: customer.contact_name || customer.company_name || rawPhone,
                customer_id: String(customer.contact_id),
            })
        }

        for (const { phone } of chatPhones) {
            if (matchedChatPhones.has(phone)) continue
            const sender = await resolveUnknownSender(access_token, phone)
            entries.push({ phone, ...sender })
        }

        const withHistory = new Set(chatPhones.map((c) => c.phone))
        await Promise.all(
            entries
                .filter((entry) => withHistory.has(entry.phone))
                .map(async (entry) => {
                    const preview = toPreview(await getLastChatMessage(entry.phone))
                    if (preview) entry.last_message = preview
                }),
        )

        entries.sort((a, b) => {
            const at = a.last_message?.timestamp ?? 0
            const bt = b.last_message?.timestamp ?? 0
            if (at !== bt) return bt - at
            return a.name.localeCompare(b.name)
        })

        res.status(200).json({ chats: entries })
    } catch (error) {
        console.error('Error loading WhatsApp chats:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load WhatsApp chats' });
    }
}

/** Builds the chat-history response: messages oldest first, and whether a free-form reply is currently allowed. */
async function buildConversation(phone: string) {
    const messages = await getChatMessages(phone)
    const lastInbound = [...messages].reverse().find((m) => m.direction === "in")
    const windowExpiresAt = lastInbound ? lastInbound.timestamp + REPLY_WINDOW_MS : undefined
    return {
        messages: messages.map(toMessageView),
        can_reply: !!windowExpiresAt && windowExpiresAt > Date.now(),
        ...(windowExpiresAt && { reply_window_expires_at: windowExpiresAt }),
    }
}

/** One conversation's stored history (kept for 7 days). */
export async function getWhatsAppChatMessages(req: Request, res: Response) {
    try {
        const phone = readPhoneParam(req)
        res.status(200).json(await buildConversation(phone))
    } catch (error) {
        console.error('Error loading WhatsApp conversation:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to load conversation' });
    }
}

/**
 * Sends a free-text WhatsApp message. Only allowed to a number that has
 * messaged us within the last 24 hours — WhatsApp rejects free-form messages
 * outside that window anyway, and checking it here means this endpoint can
 * only ever answer someone who wrote in, never start a conversation with an
 * arbitrary number.
 */
export async function sendWhatsAppChatMessage(req: Request, res: Response) {
    try {
        const phone = readPhoneParam(req)
        const text = typeof req.body?.text === "string" ? req.body.text.trim() : ""
        if (!text) throw new Error("Message text is required")
        if (text.length > MAX_TEXT_LENGTH) throw new Error(`Messages are limited to ${MAX_TEXT_LENGTH} characters`)

        const { can_reply } = await buildConversation(phone)
        if (!can_reply)
            throw new Error("WhatsApp only allows replies within 24 hours of the customer's last message")

        await replyToWhatsAppMessage(phone, text)
        res.status(201).json(await buildConversation(phone))
    } catch (error) {
        console.error('Error sending WhatsApp chat message:', error);
        const message = error instanceof Error
            ? error.message
            : (error as any)?.error?.message ?? 'Failed to send message'
        res.status(400).json({ error: message });
    }
}
