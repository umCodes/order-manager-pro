import { ZohoGetCustomerById, getContactPreferredLanguage, getContactPhonesByIds } from "../zoho/customers/index.js"
import { sendPaymentNotification, sendBalanceNotification } from "./notifications.js"
import { createInvoicePdfBufferForLanguage, toInvoicePdfData } from "../../pdf/index.js"
import type { ZohoInvoice } from "../zoho/types.js"

/**
 * Resolves the invoice's customer phone/language from Zoho and sends the
 * payment notification, to one or more contacts. Failures are logged, never
 * thrown — a WhatsApp failure must not roll back or fail the payment that
 * already succeeded. `contactPersonIds`, when given, sends to the specific
 * contacts chosen by the caller (e.g. picked in the UI) instead of the
 * customer's single default-resolved phone — resolved against this
 * customer's own contact list, never raw phone numbers from the caller.
 * Returns true only if every resolved recipient was sent successfully.
 */
export async function notifyPaymentRecorded(
    accessToken: string,
    invoice: ZohoInvoice,
    paymentAmount: number,
    paymentDate: string,
    contactPersonIds?: string[],
) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, String(invoice.customer_id))
        const phones = getContactPhonesByIds(contact, contactPersonIds)
        console.log(
            `[WhatsApp] notifyPaymentRecorded: invoice=${invoice.invoice_number} customer=${invoice.customer_id} phones=${JSON.stringify(phones)}`,
        )
        if (phones.length === 0) throw new Error(`No phone number on file for customer ${invoice.customer_id}`)

        const preferredLanguage = getContactPreferredLanguage(contact)
        console.log(`[WhatsApp] notifyPaymentRecorded: resolved preferred_language="${preferredLanguage}" for customer=${invoice.customer_id}`)
        let allSucceeded = true
        for (const phone of phones) {
            try {
                await sendPaymentNotification(phone, preferredLanguage, String(paymentAmount), paymentDate, String(invoice.balance))
            } catch (error) {
                console.error(`Failed to send WhatsApp payment notification to ${phone} (language="${preferredLanguage}"):`, error)
                allSucceeded = false
            }
        }
        return allSucceeded
    } catch (error) {
        console.error("Failed to send WhatsApp payment notification:", error)
        return false
    }
}

/**
 * Resolves the invoice's customer phone/language from Zoho, fetches the
 * invoice PDF once, and sends the balance notification to one or more
 * contacts. `customer.outstanding_receivable_amount` is read *after* this
 * invoice's own balance is already reflected in it (i.e. after marking sent
 * / recording payment), so "balance before" is derived by subtracting this
 * invoice's current balance back out. Failures are logged, never thrown.
 * `contactPersonIds` behaves as in notifyPaymentRecorded above.
 */
export async function notifyInvoiceSent(accessToken: string, invoice: ZohoInvoice, contactPersonIds?: string[]) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, String(invoice.customer_id))
        const phones = getContactPhonesByIds(contact, contactPersonIds)
        console.log(
            `[WhatsApp] notifyInvoiceSent: invoice=${invoice.invoice_number} customer=${invoice.customer_id} phones=${JSON.stringify(phones)}`,
        )
        if (phones.length === 0) throw new Error(`No phone number on file for customer ${invoice.customer_id}`)

        const preferredLanguage = getContactPreferredLanguage(contact)
        console.log(`[WhatsApp] notifyInvoiceSent: resolved preferred_language="${preferredLanguage}" for customer=${invoice.customer_id}`)
        const pdf = await createInvoicePdfBufferForLanguage(toInvoicePdfData(invoice), preferredLanguage)
        console.log(`[WhatsApp] notifyInvoiceSent: generated PDF, bytes=${pdf.length}`)
        const paidAmountFromInvoice = invoice.total - invoice.balance
        const balanceAfter = contact.outstanding_receivable_amount
        const balanceBefore = balanceAfter - invoice.balance

        let allSucceeded = true
        for (const phone of phones) {
            try {
                await sendBalanceNotification(
                    phone,
                    preferredLanguage,
                    pdf,
                    `${invoice.invoice_number}.pdf`,
                    invoice.invoice_number,
                    String(invoice.total),
                    String(paidAmountFromInvoice),
                    String(balanceBefore),
                    String(balanceAfter),
                )
            } catch (error) {
                console.error(`Failed to send WhatsApp balance notification to ${phone} (language="${preferredLanguage}"):`, error)
                allSucceeded = false
            }
        }
        return allSucceeded
    } catch (error) {
        console.error("Failed to send WhatsApp balance notification:", error)
        return false
    }
}
