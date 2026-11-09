import { redisClient } from "../../config/redis.js"
import { describeSendError, getChatMessage, toWaId } from "./chatStore.js"

/**
 * Who an invoice was sent to on WhatsApp (the "invoice sent" message with
 * its PDF), kept per invoice so its page can show it any time later: one
 * entry per number — a re-send to the same number replaces it — with the
 * message's latest status. Statuses come from the chat history (WhatsApp's
 * sent / delivered / read / failed updates, merged in by the webhook
 * Lambda) and are copied onto the entry, so they outlive the chat
 * history's 7 days.
 *
 *   invoice-wa-sends:<invoice_id>  hash  phone -> InvoiceSend JSON (no expiry)
 */

export type InvoiceSendStatus = "sent" | "delivered" | "read" | "failed"

export type InvoiceSend = {
    phone: string
    contactPersonId: string
    name: string
    /** WhatsApp's message id; missing when WhatsApp rejected the send outright. */
    messageId?: string
    /** The number as WhatsApp resolved it (the chat history is keyed by it). */
    waId?: string
    status: InvoiceSendStatus
    error?: string
    sentAt: string
}

const sendsKey = (invoiceId: string) => `invoice-wa-sends:${invoiceId}`

/** Records a send that WhatsApp accepted (`result` is its send response) or rejected (`error`). Never throws. */
export async function recordInvoiceSend(
    invoiceId: string,
    recipient: { phone: string; contactPersonId: string; name: string },
    outcome: { result: any } | { error: unknown },
) {
    try {
        const entry: InvoiceSend =
            "result" in outcome
                ? {
                      ...recipient,
                      messageId: outcome.result?.messages?.[0]?.id,
                      waId: outcome.result?.contacts?.[0]?.wa_id ?? toWaId(recipient.phone),
                      status: "sent",
                      sentAt: new Date().toISOString(),
                  }
                : { ...recipient, status: "failed", error: describeSendError(outcome.error), sentAt: new Date().toISOString() }
        await redisClient.hSet(sendsKey(invoiceId), recipient.phone, JSON.stringify(entry))
    } catch (error) {
        console.error(`Failed to record the WhatsApp send of invoice ${invoiceId} to ${recipient.phone}:`, error)
    }
}

const STATUS_RANK: Record<InvoiceSendStatus, number> = { sent: 0, delivered: 1, read: 2, failed: 3 }

/** An invoice's sends, each with its latest status from the chat history (saved back when it moved on). */
export async function getInvoiceSends(invoiceId: string): Promise<InvoiceSend[]> {
    const hash = await redisClient.hGetAll(sendsKey(invoiceId))
    const sends: InvoiceSend[] = []
    for (const [phone, raw] of Object.entries(hash)) {
        let entry: InvoiceSend
        try {
            entry = JSON.parse(raw)
        } catch {
            continue
        }
        if (entry.messageId && entry.waId && entry.status !== "read" && entry.status !== "failed") {
            const message = await getChatMessage(entry.waId, entry.messageId).catch(() => undefined)
            const live = message?.status as InvoiceSendStatus | undefined
            if (live && live in STATUS_RANK && STATUS_RANK[live] > STATUS_RANK[entry.status]) {
                entry = { ...entry, status: live, ...(live === "failed" && message?.error ? { error: String(message.error) } : {}) }
                await redisClient.hSet(sendsKey(invoiceId), phone, JSON.stringify(entry)).catch(() => undefined)
            }
        }
        sends.push(entry)
    }
    return sends.sort((a, b) => a.name.localeCompare(b.name))
}
