import { WhatsAppApi } from "./client.js"
import { appendChatMessage, normalizeWaPhone } from "./chatStore.js"

export type TemplateParameter =
    | { type: "text"; text: string }
    | { type: "document"; document: { id: string; filename?: string } }

export type TemplateComponent = {
    type: "header" | "body" | "button"
    parameters: TemplateParameter[]
}

/**
 * Saves a successfully sent template into the shared chat history, with the
 * placeholder values it was filled with. Keyed by the wa_id Meta returns (so
 * it lands in the same chat as the customer's replies), falling back to the
 * normalized `to`. Never throws — history is best-effort and must not turn a
 * delivered notification into a failed one.
 */
async function recordSentTemplate(
    to: string,
    result: any,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[],
) {
    try {
        const messageId = result?.messages?.[0]?.id
        if (!messageId) return
        const waId = normalizeWaPhone(result?.contacts?.[0]?.wa_id ?? to)
        await appendChatMessage(waId, {
            id: messageId,
            to: waId,
            type: "template",
            template: { name: templateName, language: { code: languageCode }, components },
            direction: "out",
            timestamp: Date.now(),
            status: "sent",
        })
    } catch (error) {
        console.error(`[WhatsApp template] failed to record "${templateName}" to ${to} in chat history:`, error)
    }
}

/** Sends one of the pre-approved WhatsApp templates, filling in its header/body parameters. */
export async function sendWhatsAppTemplate(
    to: string,
    templateName: string,
    components: TemplateComponent[],
    languageCode: string = "en",
) {
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
        await recordSentTemplate(to, result, templateName, languageCode, components)
        return result
    } catch (error) {
        console.error(`[WhatsApp template] "${templateName}" (language "${languageCode}") to ${to} FAILED:`, error)
        throw error
    }
}

/** Sends a plain text message — only valid inside an open 24h customer service window. */
export async function replyToWhatsAppMessage(to: string, message: string) {
    try {
        return await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message },
        })
    } catch (error) {
        console.error("Error replying to WhatsApp message:", error)
        throw error
    }
}
