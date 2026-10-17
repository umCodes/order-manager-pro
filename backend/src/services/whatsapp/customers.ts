import { ZohoGetCustomerById, getContactDisplayName, getContactPreferredLanguage, getContactPhonesByIds } from "../zoho/customers/index.js"
import {
    sendPaymentNotification,
    sendPaymentCorrectionNotification,
    sendPaymentDeletionNotification,
    sendReturnNotification,
} from "./notifications.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"
import { createReturnNoticePdfBuffer, toReturnNoticePdfData } from "../../pdf/index.js"
import { getInvoiceReturn } from "../returns/invoiceReturns.js"

/**
 * Sends the payment confirmation for a customer-level payment, to one or
 * more contacts. The remaining balance is the customer's total outstanding
 * across all invoices, read now — so after the payment when called right
 * after recording it, and the current balance when re-sending an older one.
 * Failures are logged, never thrown. `contactPersonIds` resolves against
 * this customer's own contact list, never raw phone numbers from the caller.
 * Returns true only if every resolved recipient was sent successfully.
 */
export async function notifyCustomerPayment(
    accessToken: string,
    customerId: string,
    paymentAmount: number,
    paymentDate: string,
    contactPersonIds?: string[],
) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, customerId)
        const phones = getContactPhonesByIds(contact, contactPersonIds)
        console.log(`[WhatsApp] notifyCustomerPayment: customer=${customerId} phones=${JSON.stringify(phones)}`)
        if (phones.length === 0) throw new Error(`No phone number on file for customer ${customerId}`)

        const preferredLanguage = getContactPreferredLanguage(contact)
        const customerName = getContactDisplayName(contact)
        console.log(`[WhatsApp] notifyCustomerPayment: resolved preferred_language="${preferredLanguage}" for customer=${customerId}`)
        const remainingBalance = String(contact.outstanding_receivable_amount)
        let allSucceeded = true
        for (const phone of phones) {
            try {
                await sendPaymentNotification(phone, customerName, preferredLanguage, String(paymentAmount), paymentDate, remainingBalance)
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
 * Sends one notification to the customer's chosen contacts (or their default
 * one), in the customer's language. `send` gets each phone plus what it needs
 * about the customer; the balance it's given is the customer's total
 * outstanding, read now (so after the change that triggered it). Failures
 * are logged, never thrown; returns true only if every recipient got it.
 */
async function notifyCustomerContacts(
    accessToken: string,
    customerId: string,
    contactPersonIds: string[] | undefined,
    label: string,
    send: (phone: string, customer: { name: string; language: PreferredLanguage; balance: string; contact: any }) => Promise<unknown>,
) {
    try {
        const contact = await ZohoGetCustomerById(accessToken, customerId)
        const phones = getContactPhonesByIds(contact, contactPersonIds)
        console.log(`[WhatsApp] ${label}: customer=${customerId} phones=${JSON.stringify(phones)}`)
        if (phones.length === 0) throw new Error(`No phone number on file for customer ${customerId}`)

        const customer = {
            name: getContactDisplayName(contact),
            language: getContactPreferredLanguage(contact),
            balance: String(contact.outstanding_receivable_amount),
            contact,
        }
        let allSucceeded = true
        for (const phone of phones) {
            try {
                await send(phone, customer)
            } catch (error) {
                console.error(`Failed to send WhatsApp ${label} to ${phone} (language="${customer.language}"):`, error)
                allSucceeded = false
            }
        }
        return allSucceeded
    } catch (error) {
        console.error(`Failed to send WhatsApp ${label}:`, error)
        return false
    }
}

/** Payment correction: a payment's amount changed from `oldAmount` to `newAmount`. */
export function notifyPaymentCorrected(
    accessToken: string,
    customerId: string,
    paymentNumber: string,
    oldAmount: number,
    newAmount: number,
    contactPersonIds?: string[],
) {
    return notifyCustomerContacts(accessToken, customerId, contactPersonIds, "payment correction", (phone, c) =>
        sendPaymentCorrectionNotification(phone, c.name, c.language, paymentNumber, String(oldAmount), String(newAmount), c.balance),
    )
}

/** Payment deletion: the payment numbered `paymentNumber` was deleted. */
export function notifyPaymentDeleted(accessToken: string, customerId: string, paymentNumber: string, contactPersonIds?: string[]) {
    return notifyCustomerContacts(accessToken, customerId, contactPersonIds, "payment deletion", (phone, c) =>
        sendPaymentDeletionNotification(phone, c.name, c.language, paymentNumber, c.balance),
    )
}

/**
 * Return notice: a return made from `invoiceId`, with its Return Notice PDF
 * (in the customer's language, named by the return's number). The balance
 * sent is the one recorded when the return was made — the same one printed
 * on the PDF — falling back to the customer's current balance.
 */
export async function notifyInvoiceReturn(accessToken: string, invoiceId: string, creditNoteId: string, contactPersonIds?: string[]) {
    let found: Awaited<ReturnType<typeof getInvoiceReturn>>
    try {
        found = await getInvoiceReturn(accessToken, invoiceId, creditNoteId)
    } catch (error) {
        console.error("Failed to send WhatsApp return notice:", error)
        return false
    }
    const { invoice, creditNote, balanceAfter } = found
    if (!invoice.customer_id) return false
    let pdf: Buffer | undefined
    return notifyCustomerContacts(accessToken, String(invoice.customer_id), contactPersonIds, "return notice", async (phone, c) => {
        pdf ??= await createReturnNoticePdfBuffer(toReturnNoticePdfData(creditNote, invoice, balanceAfter, c.contact), c.language)
        return sendReturnNotification(
            phone,
            c.name,
            c.language,
            pdf,
            `${creditNote.creditnote_number}.pdf`,
            creditNote.creditnote_number,
            invoice.invoice_number,
            String(creditNote.total),
            balanceAfter !== undefined ? String(balanceAfter) : c.balance,
        )
    })
}
