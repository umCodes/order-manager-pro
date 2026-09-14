import { WhatsAppApi } from "./client.js"
import { normalizePhoneForSending } from "../../utils/phone.js"
import { recordWhatsAppMessage } from "./log.js"

export type TemplateParameter =
    | { type: "text"; text: string }
    | { type: "document"; document: { id: string; filename?: string } }

export type TemplateComponent = {
    type: "header" | "body" | "button"
    parameters: TemplateParameter[]
}

/**
 * A normalized number that still starts with a local trunk "0", or is
 * implausibly short, is most likely missing its country code — not
 * something normalization can safely fix (contacts span more than one
 * country), but worth flagging loudly since it'll fail to deliver.
 */
function warnIfLikelyMissingCountryCode(original: string, normalized: string) {
    if (normalized.startsWith("0") || normalized.length < 8) {
        console.warn(
            `[WhatsApp] phone number "${original}" normalized to "${normalized}", which looks like it's missing a country code — this send will likely fail to deliver`,
        )
    }
}

/**
 * Sends one of the pre-approved WhatsApp templates, filling in its
 * header/body parameters. Records the attempt (accepted or rejected by
 * Meta) in the WhatsApp message log; the real delivery outcome arrives
 * later via the status webhook and updates this same log entry.
 */
export async function sendWhatsAppTemplate(
    to: string,
    templateName: string,
    components: TemplateComponent[],
    languageCode: string = "en",
) {
    const normalizedTo = normalizePhoneForSending(to)
    warnIfLikelyMissingCountryCode(to, normalizedTo)

    try {
        console.log(
            `[WhatsApp template] sending "${templateName}" (language "${languageCode}") to ${normalizedTo} — components:`,
            JSON.stringify(components),
        )
        const result = await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: normalizedTo,
            type: "template",
            template: {
                name: templateName,
                language: { code: languageCode },
                components,
            },
        })
        console.log(`[WhatsApp template] "${templateName}" (language "${languageCode}") to ${normalizedTo} succeeded`)

        const messageId: string | undefined = result?.messages?.[0]?.id
        await recordWhatsAppMessage({
            message_id: messageId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            to: normalizedTo,
            template_name: templateName,
            language: languageCode,
            status: "sent",
        })

        return result
    } catch (error) {
        console.error(`[WhatsApp template] "${templateName}" (language "${languageCode}") to ${normalizedTo} FAILED:`, error)

        const metaError = (error as any)?.error
        await recordWhatsAppMessage({
            message_id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            to: normalizedTo,
            template_name: templateName,
            language: languageCode,
            status: "failed",
            error: { code: metaError?.code, message: metaError?.message ?? String(error) },
        })

        throw error
    }
}

/** Sends a plain text message — only valid inside an open 24h customer service window. */
export async function replyToWhatsAppMessage(to: string, message: string) {
    try {
        return await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            to: normalizePhoneForSending(to),
            type: "text",
            text: { body: message },
        })
    } catch (error) {
        console.error("Error replying to WhatsApp message:", error)
        throw error
    }
}
