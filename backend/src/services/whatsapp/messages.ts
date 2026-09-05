import { WhatsAppApi } from "./client.js"

export type TemplateParameter =
    | { type: "text"; text: string }
    | { type: "document"; document: { id: string; filename?: string } }

export type TemplateComponent = {
    type: "header" | "body" | "button"
    parameters: TemplateParameter[]
}

/** Sends one of the pre-approved WhatsApp templates, filling in its header/body parameters. */
export async function sendWhatsAppTemplate(
    to: string,
    templateName: string,
    components: TemplateComponent[],
    languageCode: string = "en",
) {
    try {
        return await WhatsAppApi("messages", "POST", {
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
    } catch (error) {
        console.error(`Error sending WhatsApp template "${templateName}":`, error)
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
