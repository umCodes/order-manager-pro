import { uploadWhatsAppMedia } from "./client.js"
import { sendWhatsAppTemplate } from "./messages.js"
import { resolveNotificationTemplate } from "./notificationTemplates.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"

/**
 * "Payment Confirmation" template: sent when a payment is made.
 * Body params: {{1}} current payment amount, {{2}} date, {{3}} the customer's
 * total remaining balance across all their invoices.
 * The template per customer preferred_language is assigned in the app
 * (see notificationTemplates.ts).
 */
export async function sendPaymentNotification(
    to: string,
    preferredLanguage: PreferredLanguage,
    paymentAmount: string,
    date: string,
    remainingBalance: string,
) {
    try {
        const template = await resolveNotificationTemplate("payment", preferredLanguage)
        console.log(
            `[WhatsApp] payment notification: language="${preferredLanguage}" -> template="${template?.name ?? "(none assigned)"}", waLanguageCode="${template?.language}", source=${template?.source}`,
        )
        if (!template) throw new Error(`No payment confirmation template assigned for language "${preferredLanguage}" (Messages → WhatsApp → Templates → Notification templates)`)

        return await sendWhatsAppTemplate(
            to,
            template.name,
            [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: paymentAmount },
                        { type: "text", text: date },
                        { type: "text", text: remainingBalance },
                    ],
                },
            ],
            template.language,
            `Payment confirmation: ${paymentAmount} received on ${date}. Remaining balance: ${remainingBalance}`,
        )
    } catch (error) {
        console.error("Error sending payment notification:", error)
        throw error
    }
}

/**
 * "Balance Notification" template: sent when an invoice is marked as sent.
 * Header: the invoice PDF. Body params: {{1}} invoice number, {{2}} invoice
 * amount, {{3}} amount paid from the invoice, {{4}} balance before this
 * invoice, {{5}} balance after this invoice.
 */
export async function sendBalanceNotification(
    to: string,
    preferredLanguage: PreferredLanguage,
    pdf: Buffer,
    pdfFilename: string,
    invoiceNumber: string,
    invoiceAmount: string,
    paidAmountFromInvoice: string,
    balanceBeforeInvoice: string,
    balanceAfterInvoice: string,
) {
    try {
        const template = await resolveNotificationTemplate("balance", preferredLanguage)
        console.log(
            `[WhatsApp] balance notification: language="${preferredLanguage}" -> template="${template?.name ?? "(none assigned)"}", waLanguageCode="${template?.language}", source=${template?.source}, pdfFilename="${pdfFilename}", pdfBytes=${pdf.length}`,
        )
        if (!template) throw new Error(`No invoice-sent template assigned for language "${preferredLanguage}" (Messages → WhatsApp → Templates → Notification templates)`)

        const mediaId = await uploadWhatsAppMedia(pdf, pdfFilename, "application/pdf")
        console.log(`[WhatsApp] balance notification: uploaded PDF media id="${mediaId}"`)

        return await sendWhatsAppTemplate(
            to,
            template.name,
            [
                {
                    type: "header",
                    parameters: [
                        { type: "document", document: { id: mediaId, filename: pdfFilename } },
                    ],
                },
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: invoiceNumber },
                        { type: "text", text: invoiceAmount },
                        { type: "text", text: paidAmountFromInvoice },
                        { type: "text", text: balanceBeforeInvoice },
                        { type: "text", text: balanceAfterInvoice },
                    ],
                },
            ],
            template.language,
            `Invoice ${invoiceNumber} (${pdfFilename}): amount ${invoiceAmount}, paid ${paidAmountFromInvoice}. Balance ${balanceBeforeInvoice} → ${balanceAfterInvoice}`,
        )
    } catch (error) {
        console.error("Error sending balance notification:", error)
        throw error
    }
}
