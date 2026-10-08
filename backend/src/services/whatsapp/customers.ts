import { ZohoGetCustomerById, getContactPreferredLanguage, getContactPhonesByIds } from "../zoho/customers/index.js"
import { sendPaymentNotification } from "./notifications.js"

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
        const customerName = contact.contact_name || contact.company_name || ""
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
