import { WhatsAppApi, uploadWhatsAppMedia } from "./client.js"
import { recordFailedOutboundMessage, recordOutboundMessage } from "./chatStore.js"

export type TemplateParameter =
    | { type: "text"; text: string; parameter_name?: string }
    | { type: "document"; document: { id: string; filename?: string } }

export type TemplateComponent = {
    type: "header" | "body" | "button"
    parameters: TemplateParameter[]
    /** Buttons only: which kind, and its position among the template's buttons. */
    sub_type?: "url"
    index?: string
}

/**
 * Sends one of the pre-approved WhatsApp templates, filling in its
 * header/body parameters. `chatSummary` is the readable text shown for this
 * message in the in-app WhatsApp chat history (the template's own wording
 * lives in Meta Business Manager, not here). Every attempt is recorded in
 * the chat history, including ones WhatsApp rejects outright (as failed).
 */
export async function sendWhatsAppTemplate(
    to: string,
    templateName: string,
    components: TemplateComponent[],
    languageCode: string = "en",
    chatSummary?: string,
) {
    // Stored in the chat history with everything needed to send it again
    // from the chat view (see retryWhatsAppChatMessage).
    const chatRecord = {
        type: "template",
        template: { name: templateName, language: languageCode, components },
        ...(chatSummary && { summary: chatSummary }),
    }
    try {
        console.log(
            `[WhatsApp template] sending "${templateName}" (language "${languageCode}") to ${to} — components:`,
            JSON.stringify(components),
        )
        const result = await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "template",
            template: {
                name: templateName,
                language: { code: languageCode },
                components,
            },
        })
        console.log(`[WhatsApp template] "${templateName}" (language "${languageCode}") to ${to} succeeded`)
        await recordOutboundMessage(result, to, chatRecord)
        return result
    } catch (error) {
        console.error(`[WhatsApp template] "${templateName}" (language "${languageCode}") to ${to} FAILED:`, error)
        await recordFailedOutboundMessage(to, chatRecord, error)
        throw error
    }
}

/** Sends a plain text message — only valid inside an open 24h customer service window. */
export async function replyToWhatsAppMessage(to: string, message: string) {
    try {
        const result = await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message },
        })
        await recordOutboundMessage(result, to, { type: "text", text: { body: message } })
        return result
    } catch (error) {
        console.error("Error replying to WhatsApp message:", error)
        throw error
    }
}

export type WhatsAppMediaKind = "image" | "audio" | "video" | "document"

/**
 * Uploads a file and sends it as a media message — only valid inside an
 * open 24h customer service window, like a text reply. `voice` marks an
 * Ogg/Opus recording made in the app (sent as audio, shown as a voice note).
 */
export async function sendWhatsAppMedia(
    to: string,
    kind: WhatsAppMediaKind,
    file: Buffer,
    mimeType: string,
    options: { filename: string; caption?: string; voice?: boolean },
) {
    try {
        const mediaId = await uploadWhatsAppMedia(file, options.filename, mimeType)
        const payload: Record<string, string> = { id: mediaId }
        if (options.caption && kind !== "audio") payload.caption = options.caption
        if (kind === "document") payload.filename = options.filename

        const result = await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: kind,
            [kind]: payload,
        })
        await recordOutboundMessage(result, to, {
            type: kind,
            [kind]: {
                ...payload,
                mime_type: mimeType,
                ...(kind !== "document" && { filename: options.filename }),
                ...(options.voice && { voice: true }),
            },
        })
        return result
    } catch (error) {
        console.error(`Error sending WhatsApp ${kind} message:`, error)
        throw error
    }
}
