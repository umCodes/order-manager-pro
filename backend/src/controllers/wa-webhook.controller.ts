import type { Request, Response } from 'express';
import { ENV } from '../constants/env.js';
import { mintZohoAccessToken } from '../services/zoho/auth.js';
import { findCustomerByPhone, getContactPreferredLanguage } from '../services/zoho/customers/index.js';
import type { PreferredLanguage } from '../services/zoho/customers/index.js';
import { downloadWhatsAppMedia } from '../services/whatsapp/client.js';
import { replyWithUnmonitoredNumberNotice } from '../services/whatsapp/unmonitored-reply.js';
import { sendWhatsAppMessageNotificationEmail, type InboundWhatsAppMessage } from '../services/email/whatsapp-notification.js';

/** Meta's webhook verification handshake: echoes the challenge back when the verify token matches. */
export async function handleWaWebhookVerification(req: Request, res: Response){
    const mode = req.query["hub.mode"]
    const token = req.query["hub.verify_token"]
    const challenge = req.query["hub.challenge"]

    if (mode === "subscribe" && token === ENV.WA_VERIFY_TOKEN)
        return res.status(200).send(challenge);

    return res.sendStatus(403)
};

const MEDIA_EXTENSION_BY_TYPE: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/amr": "amr",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "application/pdf": "pdf",
}

function guessFilename(mimeType: string, fallbackBase: string): string {
    const [type] = mimeType.split(";")
    const extension = MEDIA_EXTENSION_BY_TYPE[type ?? ""] ?? (type?.split("/")[1] || "bin")
    return `${fallbackBase}.${extension}`
}

/** Extracts the media id + optional caption/filename off a message's type-specific payload, for the types that carry an uploaded file. */
function getMediaPayload(message: any): { id: string; caption?: string; filename?: string } | undefined {
    const payload = message[message.type]
    if (!payload?.id) return undefined
    return { id: payload.id, caption: payload.caption, filename: payload.filename }
}

async function resolveCustomer(headers: string, from: string) {
    try {
        const match = await findCustomerByPhone(headers, from)
        if (!match) return { label: undefined, language: "en" as PreferredLanguage }

        const name = match.contact?.contact_name || match.contact?.company_name || "Unknown name"
        const label = match.contactPerson
            ? `${name} (${match.contactPerson.first_name ?? "contact"})`
            : name
        return { label, language: getContactPreferredLanguage(match.contact) }
    } catch (error) {
        console.error("Error looking up WhatsApp sender's customer record:", error)
        return { label: undefined, language: "en" as PreferredLanguage }
    }
}

async function processInboundMessage(message: any, senderName: string | undefined) {
    const from = message.from as string

    let headers: string | undefined
    let customer: { label: string | undefined; language: PreferredLanguage } = { label: undefined, language: "en" }
    try {
        const { access_token } = await mintZohoAccessToken()
        headers = `Bearer ${access_token}`
        customer = await resolveCustomer(headers, from)
    } catch (error) {
        console.error("Error fetching Zoho access token for WhatsApp webhook:", error)
    }

    const notification: InboundWhatsAppMessage = {
        from,
        messageId: message.id,
        timestamp: message.timestamp,
        type: message.type,
        ...(senderName && { senderName }),
        ...(customer.label && { customerLabel: customer.label }),
    }

    if (message.type === "text") {
        if (message.text?.body) notification.text = message.text.body
    } else if (message.type === "location") {
        notification.location = message.location
    } else {
        const media = getMediaPayload(message)
        if (media) {
            if (media.caption) notification.caption = media.caption
            try {
                const { buffer, mimeType } = await downloadWhatsAppMedia(media.id)
                notification.media = {
                    buffer,
                    mimeType,
                    filename: media.filename ?? guessFilename(mimeType, `${message.type}-${message.id}`),
                }
            } catch (error) {
                console.error(`Error downloading WhatsApp media for message ${message.id}:`, error)
            }
        }
    }

    await sendWhatsAppMessageNotificationEmail(notification)

    try {
        await replyWithUnmonitoredNumberNotice(from, customer.language)
    } catch (error) {
        console.error(`Error sending unmonitored-number auto-reply to ${from}:`, error)
    }
}

export async function handleWaWebhookEvent(req: Request, res: Response) {
    // Meta requires a fast 200 response; process messages after acknowledging so retries aren't triggered by slow downstream work (Zoho lookup, media download, email send).
    res.sendStatus(200)

    try {
        const entries = req.body?.entry ?? []
        for (const entry of entries) {
            for (const change of entry?.changes ?? []) {
                const value = change?.value
                if (change?.field !== "messages" || !value?.messages?.length) continue

                const senderName = value.contacts?.[0]?.profile?.name

                for (const message of value.messages) {
                    try {
                        await processInboundMessage(message, senderName)
                    } catch (error) {
                        console.error(`Error processing inbound WhatsApp message ${message?.id}:`, error)
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error handling WhatsApp webhook event:", error)
    }
}
