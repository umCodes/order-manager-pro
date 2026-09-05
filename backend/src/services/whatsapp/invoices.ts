import { ZohoGetCustomerById, getContactPreferredLanguage, getContactPhone, getContactPhoneById } from "../zoho/customers/index.js"
import { sendPaymentNotification, sendBalanceNotification } from "./notifications.js"
import { createInvoicePdfBufferForLanguage, toInvoicePdfData } from "../../pdf/index.js"
import type { ZohoInvoice } from "../zoho/types.js"

/**
 * Resolves the invoice's customer phone/language from Zoho and sends the
 * payment notification. Failures are logged, never thrown — a WhatsApp
 * failure must not roll back or fail the payment that already succeeded.
 * `contactPersonId`, when given, sends to a specific contact chosen by the
 * caller (e.g. picked in the UI when the customer has more than one
 * contact) instead of the customer's default-resolved phone — resolved
 * against this customer's own contact list, never a raw phone from the caller.
 */
export async function notifyPaymentRecorded(
    accessToken: string,
    invoice: ZohoInvoice,
    paymentAmount: number,
    paymentDate: string,
    contactPersonId?: string,
) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, String(invoice.customer_id))
        const phone = contactPersonId ? getContactPhoneById(contact, contactPersonId) : getContactPhone(contact)
        if (!phone) throw new Error(`No phone number on file for customer ${invoice.customer_id}`)

        await sendPaymentNotification(
            phone,
            getContactPreferredLanguage(contact),
            String(paymentAmount),
            paymentDate,
            String(invoice.balance),
        )
        return true
    } catch (error) {
        console.error("Failed to send WhatsApp payment notification:", error)
        return false
    }
}

/**
 * Resolves the invoice's customer phone/language from Zoho, fetches the
 * invoice PDF, and sends the balance notification. `customer.outstanding_receivable_amount`
 * is read *after* this invoice's own balance is already reflected in it (i.e.
 * after marking sent / recording payment), so "balance before" is derived by
 * subtracting this invoice's current balance back out. Failures are logged,
 * never thrown. `contactPersonId` behaves as in notifyPaymentRecorded above.
 */
export async function notifyInvoiceSent(accessToken: string, invoice: ZohoInvoice, contactPersonId?: string) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, String(invoice.customer_id))
        const phone = contactPersonId ? getContactPhoneById(contact, contactPersonId) : getContactPhone(contact)
        if (!phone) throw new Error(`No phone number on file for customer ${invoice.customer_id}`)

        const preferredLanguage = getContactPreferredLanguage(contact)
        const pdf = await createInvoicePdfBufferForLanguage(toInvoicePdfData(invoice), preferredLanguage)
        const paidAmountFromInvoice = invoice.total - invoice.balance
        const balanceAfter = contact.outstanding_receivable_amount
        const balanceBefore = balanceAfter - invoice.balance

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
        return true
    } catch (error) {
        console.error("Failed to send WhatsApp balance notification:", error)
        return false
    }
}
