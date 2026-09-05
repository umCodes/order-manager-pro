import { ENV } from "../../constants/env.js"
import { sendEmail, type EmailAttachment } from "./client.js"

export type InboundWhatsAppMessage = {
    from: string
    messageId: string
    timestamp: string
    senderName?: string
    type: string
    text?: string
    caption?: string
    location?: { latitude: number; longitude: number; name?: string; address?: string }
    media?: { buffer: Buffer; mimeType: string; filename: string }
    customerLabel?: string
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

function describeMessage(message: InboundWhatsAppMessage): string {
    switch (message.type) {
        case "text":
            return "Text message"
        case "image":
            return "Image"
        case "audio":
            return "Voice message / audio"
        case "video":
            return "Video"
        case "document":
            return "Document"
        case "sticker":
            return "Sticker"
        case "location":
            return "Location"
        default:
            return `Unsupported message type ("${message.type}")`
    }
}

function buildHtmlBody(message: InboundWhatsAppMessage): string {
    const rows: string[] = [
        `<tr><td><strong>From</strong></td><td>${escapeHtml(message.from)}</td></tr>`,
        `<tr><td><strong>Customer</strong></td><td>${escapeHtml(message.customerLabel ?? "Unknown (no matching customer found)")}</td></tr>`,
    ]
    if (message.senderName) {
        rows.push(`<tr><td><strong>WhatsApp name</strong></td><td>${escapeHtml(message.senderName)}</td></tr>`)
    }
    rows.push(`<tr><td><strong>Type</strong></td><td>${escapeHtml(describeMessage(message))}</td></tr>`)

    let body = `<table cellpadding="6" cellspacing="0" border="0">${rows.join("")}</table>`

    if (message.text) {
        body += `<p><strong>Message:</strong></p><p>${escapeHtml(message.text).replace(/\n/g, "<br/>")}</p>`
    }
    if (message.caption) {
        body += `<p><strong>Caption:</strong></p><p>${escapeHtml(message.caption).replace(/\n/g, "<br/>")}</p>`
    }
    if (message.location) {
        const { latitude, longitude, name, address } = message.location
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`
        body += `<p><strong>Location:</strong> ${name ? `${escapeHtml(name)} — ` : ""}${address ? `${escapeHtml(address)} — ` : ""}<a href="${mapsUrl}">${latitude}, ${longitude}</a></p>`
    }
    if (message.media) {
        body += `<p><strong>Attachment:</strong> ${escapeHtml(message.media.filename)} (${escapeHtml(message.media.mimeType)}) — attached to this email.</p>`
    }

    return body
}

/** Emails a description of one inbound WhatsApp message (and its attachment, if any) to the configured notification mailbox. */
export async function sendWhatsAppMessageNotificationEmail(message: InboundWhatsAppMessage) {
    try {
        const to = ENV.WA_NOTIFY_EMAIL_TO
        if (!to) throw new Error("WA_NOTIFY_EMAIL_TO is not configured")

        const subjectCustomer = message.customerLabel ?? message.from
        const subject = `WhatsApp: ${describeMessage(message)} from ${subjectCustomer}`
        const html = buildHtmlBody(message)

        const attachments: EmailAttachment[] | undefined = message.media
            ? [{ filename: message.media.filename, content: message.media.buffer }]
            : undefined

        return await sendEmail(to, subject, html, attachments)
    } catch (error) {
        console.error("Error sending WhatsApp message notification email:", error)
        throw error
    }
}
