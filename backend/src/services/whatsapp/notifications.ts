import { ENV } from "../../constants/env.js"
import { uploadWhatsAppMedia } from "./client.js"
import { sendWhatsAppTemplate } from "./messages.js"
import type { PreferredLanguage } from "../zoho/customers.js"

const PAYMENT_NOTIFICATION_TEMPLATES: Record<PreferredLanguage, string | undefined> = {
    am: ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_AM,
    ar: ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_AR,
    en: ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_EN,
}

const BALANCE_NOTIFICATION_TEMPLATES: Record<PreferredLanguage, string | undefined> = {
    am: ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_AM,
    ar: ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_AR,
    en: ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_EN,
}

/** WhatsApp template language code: Amharic templates are registered under "en" in Meta Business Manager, not "am". */
const WA_LANGUAGE_CODES: Record<PreferredLanguage, string> = {
    am: "en",
    ar: "ar",
    en: "en",
}

/**
 * "Payment Confirmation" template: sent when a payment is made.
 * Body params: {{1}} current payment amount, {{2}} date, {{3}} remaining balance.
 * The same template exists per-language in Meta Business Manager; which one
 * is used depends on the customer's preferred_language.
 */
export async function sendPaymentNotification(
    to: string,
    preferredLanguage: PreferredLanguage,
    paymentAmount: string,
    date: string,
    remainingBalance: string,
) {
    try {
        const templateName = PAYMENT_NOTIFICATION_TEMPLATES[preferredLanguage]
        if (!templateName) throw new Error(`No payment notification template configured for language "${preferredLanguage}"`)

        return await sendWhatsAppTemplate(
            to,
            templateName,
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
            WA_LANGUAGE_CODES[preferredLanguage],
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
        const templateName = BALANCE_NOTIFICATION_TEMPLATES[preferredLanguage]
        if (!templateName) throw new Error(`No balance notification template configured for language "${preferredLanguage}"`)

        const mediaId = await uploadWhatsAppMedia(pdf, pdfFilename, "application/pdf")

        return await sendWhatsAppTemplate(
            to,
            templateName,
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
            WA_LANGUAGE_CODES[preferredLanguage],
        )
    } catch (error) {
        console.error("Error sending balance notification:", error)
        throw error
    }
}
