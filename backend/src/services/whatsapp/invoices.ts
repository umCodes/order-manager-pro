import { ZohoGetCustomerById, getContactPreferredLanguage } from "../zoho/customers.js"
import { ZohoGetInvoicePdf } from "../zoho/invoices.js"
import { sendPaymentNotification, sendBalanceNotification } from "./notifications.js"
import type { ZohoInvoice } from "../../utils/types.js"

/** Zoho stores phone on the contact person, not the contact itself. */
function getContactPhone(contact: any): string | undefined {
    return contact?.contact_persons?.[0]?.phone || contact?.contact_persons?.[0]?.mobile || contact?.mobile || contact?.phone
}

/**
 * Resolves the invoice's customer phone/language from Zoho and sends the
 * payment notification. Failures are logged, never thrown — a WhatsApp
 * failure must not roll back or fail the payment that already succeeded.
 */
export async function notifyPaymentRecorded(
    accessToken: string,
    invoice: ZohoInvoice,
    paymentAmount: number,
    paymentDate: string,
) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, String(invoice.customer_id))
        const phone = getContactPhone(contact)
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
 * never thrown.
 */
export async function notifyInvoiceSent(accessToken: string, invoice: ZohoInvoice) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, String(invoice.customer_id))
        const phone = getContactPhone(contact)
        if (!phone) throw new Error(`No phone number on file for customer ${invoice.customer_id}`)

        const pdf = await ZohoGetInvoicePdf(accessToken, String(invoice.invoice_id))
        const paidAmountFromInvoice = invoice.total - invoice.balance
        const balanceAfter = contact.outstanding_receivable_amount
        const balanceBefore = balanceAfter - invoice.balance

        await sendBalanceNotification(
            phone,
            getContactPreferredLanguage(contact),
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
