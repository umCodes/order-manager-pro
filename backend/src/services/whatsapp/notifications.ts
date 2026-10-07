import { sendActionTemplate } from "./actionTemplates.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"

/**
 * "Payment recorded": sent when a payment is made. Which template, and which
 * of these values fills which of its variables, is set per customer
 * preferred_language in Settings (see actionTemplates.ts).
 */
export async function sendPaymentNotification(
    to: string,
    preferredLanguage: PreferredLanguage,
    values: { customer_name: string; payment_amount: string; payment_date: string; remaining_balance: string },
) {
    try {
        return await sendActionTemplate("payment_recorded", to, preferredLanguage, values)
    } catch (error) {
        console.error("Error sending payment notification:", error)
        throw error
    }
}

/**
 * "Invoice sent": sent with the invoice PDF when an invoice is marked as
 * sent. Template and value mapping as above.
 */
export async function sendBalanceNotification(
    to: string,
    preferredLanguage: PreferredLanguage,
    pdf: Buffer,
    pdfFilename: string,
    values: {
        customer_name: string
        invoice_number: string
        invoice_date: string
        due_date: string
        invoice_amount: string
        paid_amount: string
        invoice_balance: string
        balance_before: string
        balance_after: string
    },
) {
    try {
        console.log(`[WhatsApp] invoice_sent: pdfFilename="${pdfFilename}", pdfBytes=${pdf.length}`)
        return await sendActionTemplate("invoice_sent", to, preferredLanguage, values, { invoice_pdf: { buffer: pdf, filename: pdfFilename } })
    } catch (error) {
        console.error("Error sending balance notification:", error)
        throw error
    }
}
