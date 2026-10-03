import type { Request, Response } from 'express';
import { ZohoGetCustomersCached, findCustomerByPhone, getContactAddress } from '../services/zoho/customers/index.js';
import {
    describeChatMessage,
    getChatMessages,
    getLastChatMessage,
    listChatPhones,
    toWaId,
    updateChatMessage,
    describeSendError,
    getUnreadCounts,
    markChatRead,
    type StoredChatMessage,
} from '../services/whatsapp/chatStore.js';
import { replyToWhatsAppMessage, sendWhatsAppMedia, sendWhatsAppTemplate, type WhatsAppMediaKind } from '../services/whatsapp/messages.js';
import { downloadWhatsAppMedia } from '../services/whatsapp/client.js';
import { requireAccessToken } from '../utils/requireAccessToken.js';
import { getCache, setTTLCache } from '../utils/cache.js';

/** WhatsApp only accepts free-form (non-template) messages within 24h of the customer's last message. */
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_TEXT_LENGTH = 4096
const UNKNOWN_SENDER_NAME_TTL_SECONDS = 12 * 60 * 60
/** A template still only "sent" (never delivered) this long after sending can be retried. */
const UNDELIVERED_RETRY_AFTER_MS = 60 * 60 * 1000

/**
 * Whether a stored template can be sent again from the chat: it failed, or
 * it has sat at "sent" without being delivered for a while — and it hasn't
 * already been retried. Needs the stored components to rebuild the send.
 */
function canRetry(message: StoredChatMessage) {
    if (message.direction !== "out" || message.type !== "template" || message.retried_at) return false
    if (!message.template?.name || !Array.isArray(message.template?.components)) return false
    if (message.status === "failed") return true
    return message.status === "sent" && Date.now() - message.timestamp > UNDELIVERED_RETRY_AFTER_MS
}

type ChatPreview = { text: string; timestamp: number; direction: "in" | "out" }

type ChatListEntry = {
    phone: string
    name: string
    customer_id?: string
    /** From the customer's address, for grouping the list by city / district. */
    city?: string
    district?: string
    last_message?: ChatPreview
}

/** City and district off a Zoho contact's address custom field, omitting blanks. */
function locationOf(contact: any): { city?: string; district?: string } {
    const address = getContactAddress(contact)
    return {
        ...(address?.city && { city: address.city }),
        ...(address?.district && { district: address.district }),
    }
}

/** Last 9 digits — tolerates country-code / leading-zero differences, same as findCustomerByPhone. */
function phoneMatchKey(phone: string) {
    return toWaId(phone).replace(/^0/, "").slice(-9)
}

function toPreview(message: StoredChatMessage | undefined): ChatPreview | undefined {
    if (!message) return undefined
    return { text: describeChatMessage(message), timestamp: message.timestamp, direction: message.direction }
}

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"]

/** The media payload (id, mime_type, caption, filename, ...) on a media message, if any. */
function getMedia(message: StoredChatMessage): { id?: string; mime_type?: string; caption?: string; filename?: string; voice?: boolean } | undefined {
    return MEDIA_TYPES.includes(message.type) ? message[message.type] : undefined
}

function toMessageView(message: StoredChatMessage) {
    const media = getMedia(message)
    return {
        id: message.id,
        direction: message.direction,
        timestamp: message.timestamp,
        type: message.type,
        // Media bubbles render the file itself, so their text is just the caption.
        text: media ? media.caption ?? "" : describeChatMessage(message),
        ...(media?.id && {
            media: {
                mime_type: media.mime_type,
                ...(media.filename && { filename: media.filename }),
                ...(media.voice && { voice: true }),
            },
        }),
        ...(message.status && { status: message.status }),
        ...(message.error && { error: message.error }),
        ...(message.reaction && { reaction: message.reaction }),
        can_retry: canRetry(message),
    }
}

/** Phone path params are wa_ids: digits only. */
function readPhoneParam(req: Request) {
    const phone = toWaId(String(req.params.phone ?? ""))
    if (phone.length < 7) throw new Error("A valid phone number is required")
    return phone
}

/** Names a chat whose number isn't any customer's main phone (e.g. a secondary contact person), cached per number. */
type ResolvedSender = { name: string; customer_id?: string; city?: string; district?: string }

async function resolveUnknownSender(accessToken: string, phone: string): Promise<ResolvedSender> {
    const cacheKey = `wa-chat-sender:${phone}`
    const cached = getCache(cacheKey)
    if (cached) return cached

    let resolved: ResolvedSender = { name: `+${phone}` }
    try {
        const match = await findCustomerByPhone(accessToken, phone)
        if (match) {
            const customerName = match.contact?.contact_name || match.contact?.company_name || `+${phone}`
            resolved = {
                name: match.contactPerson?.first_name ? `${customerName} (${match.contactPerson.first_name})` : customerName,
                customer_id: String(match.contact?.contact_id),
                ...locationOf(match.contact),
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
                ...locationOf(customer),
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
        res.status(400).json({ error: describeSendError(error) });
    }
}

/**
 * Sends a stored template message again — the same template, language and
 * parameters — when it failed or was never delivered. Template messages are
 * allowed outside the 24-hour window, and this only ever repeats what was
 * already sent to this same number. The new attempt is recorded as its own
 * message (with its own status); the original is marked as retried.
 */
export async function retryWhatsAppChatMessage(req: Request, res: Response) {
    try {
        const phone = readPhoneParam(req)
        const messageId = String(req.params.messageId ?? "")
        const original = (await getChatMessages(phone)).find((m) => m.id === messageId)
        if (!original) throw new Error("Message not found (history is kept for 7 days)")
        if (!canRetry(original)) throw new Error("This message can't be sent again")

        await updateChatMessage(phone, messageId, { retried_at: Date.now() })
        try {
            await sendWhatsAppTemplate(
                phone,
                original.template.name,
                original.template.components,
                original.template.language,
                original.summary,
            )
        } catch (sendError) {
            // Already recorded as a new failed message (with its own retry);
            // report the reason, but the conversation below shows it too.
            const conversation = await buildConversation(phone)
            res.status(502).json({ error: describeSendError(sendError), ...conversation })
            return
        }
        res.status(201).json(await buildConversation(phone))
    } catch (error) {
        console.error('Error retrying WhatsApp message:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to retry message' });
    }
}

/** Largest upload accepted (WhatsApp's own limit for audio and video; images are capped lower below). */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ["image/jpeg", "image/png"]
const AUDIO_TYPES = ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"]
const VIDEO_TYPES = ["video/mp4", "video/3gpp"]

/** Picks how WhatsApp should show a file; anything it can't show inline goes as a document. */
function mediaKindFor(mimeType: string, size: number): WhatsAppMediaKind {
    if (IMAGE_TYPES.includes(mimeType) && size <= MAX_IMAGE_BYTES) return "image"
    if (AUDIO_TYPES.includes(mimeType)) return "audio"
    if (VIDEO_TYPES.includes(mimeType)) return "video"
    return "document"
}

/**
 * Sends a file (image, video, voice note, or any other file as a document)
 * as a reply. The body is the raw file bytes (sent as
 * application/octet-stream); its type, name and optional caption come in the
 * X-File-Type / X-File-Name headers and the `caption` query param. Same
 * 24-hour rule as text replies.
 */
export async function sendWhatsAppChatMedia(req: Request, res: Response) {
    try {
        const phone = readPhoneParam(req)
        const file = req.body
        if (!Buffer.isBuffer(file) || file.length === 0) throw new Error("No file received")
        if (file.length > MAX_MEDIA_BYTES) throw new Error("Files are limited to 16 MB")

        const mimeType = String(req.get("X-File-Type") || "application/octet-stream").split(";")[0]!.trim().toLowerCase()
        const filename = decodeURIComponent(String(req.get("X-File-Name") || "file")).slice(0, 200)
        const caption = typeof req.query.caption === "string" ? req.query.caption.trim().slice(0, 1024) : ""
        const voice = req.query.voice === "1" && mimeType === "audio/ogg"

        const { can_reply } = await buildConversation(phone)
        if (!can_reply)
            throw new Error("WhatsApp only allows replies within 24 hours of the customer's last message")

        const kind = mediaKindFor(mimeType, file.length)
        await sendWhatsAppMedia(phone, kind, file, mimeType, { filename, ...(caption && { caption }), voice })
        res.status(201).json(await buildConversation(phone))
    } catch (error) {
        console.error('Error sending WhatsApp media:', error);
        res.status(400).json({ error: describeSendError(error) });
    }
}

/**
 * Streams a stored message's image/voice note/file, downloaded from WhatsApp.
 * Only media referenced by this conversation's own history can be fetched.
 */
export async function getWhatsAppChatMedia(req: Request, res: Response) {
    try {
        const phone = readPhoneParam(req)
        const messageId = String(req.params.messageId ?? "")
        const message = (await getChatMessages(phone)).find((m) => m.id === messageId)
        const mediaId = message ? getMedia(message)?.id : undefined
        if (!mediaId) {
            res.status(404).json({ error: "Media not found" })
            return
        }

        const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId)
        res.set("Content-Type", mimeType || "application/octet-stream")
        res.set("Cache-Control", "private, max-age=86400")
        res.send(buffer)
    } catch (error) {
        console.error('Error downloading WhatsApp media:', error);
        res.status(502).json({ error: describeSendError(error) });
    }
}

/** Unread inbound message counts for the app's badges: the total, and per chat (only chats with any). */
export async function getWhatsAppUnread(req: Request, res: Response) {
    try {
        const chats = await getUnreadCounts()
        const total = Object.values(chats).reduce((sum, count) => sum + count, 0)
        res.status(200).json({ total, chats })
    } catch (error) {
        console.error('Error loading WhatsApp unread counts:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load unread counts' });
    }
}

/** Marks a chat as read (it was just opened, or new messages were shown in it). */
export async function markWhatsAppChatRead(req: Request, res: Response) {
    try {
        const phone = readPhoneParam(req)
        await markChatRead(phone)
        res.status(200).json({ ok: true })
    } catch (error) {
        console.error('Error marking WhatsApp chat read:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to mark chat as read' });
    }
}
