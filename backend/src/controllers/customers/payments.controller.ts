import type { Request, Response } from 'express';
import {
    ZohoGetCustomerById,
    getContactPhonesByIds,
    getContactPreferredLanguage,
    recordCustomerPayment,
} from '../../services/zoho/customers/index.js';
import { sendPaymentNotification } from '../../services/whatsapp/notifications.js';
import { todayInBusinessTimezone } from '../../utils/businessDate.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';

/**
 * Records a payment against the customer as a whole, spread across their open
 * invoices oldest-first. The optional WhatsApp confirmation is best-effort
 * and can go to one or more contacts: a failure there is logged and reported
 * as `notified: false`, never rolled back onto the payment that already
 * went through.
 */
export async function payCustomerBalance(req: Request, res: Response){
    const { id } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured recording payment")
        if (!id) throw new Error("Customer id is required")
        const { amount, payment_mode, notify, notify_contact_ids } = req.body;

        if(!amount) throw new Error("Amount not provided")

        const payment = await recordCustomerPayment(access_token, id as string, amount, payment_mode)

        let notified = false
        if (notify) {
            try {
                const contact = await ZohoGetCustomerById(access_token, id as string)
                // Chosen contacts must resolve to phones on this customer's own
                // contact list — never trust raw phone numbers from the client.
                const phones = getContactPhonesByIds(contact, notify_contact_ids)
                console.log(`[WhatsApp] payCustomerBalance: customer=${id} phones=${JSON.stringify(phones)}`)
                if (phones.length === 0) throw new Error(`No phone number on file for customer ${id}`)

                const preferredLanguage = getContactPreferredLanguage(contact)
                console.log(`[WhatsApp] payCustomerBalance: resolved preferred_language="${preferredLanguage}" for customer=${id}`)
                let allSucceeded = true
                for (const phone of phones) {
                    try {
                        await sendPaymentNotification(
                            phone,
                            preferredLanguage,
                            String(amount),
                            payment.date ?? todayInBusinessTimezone(),
                            String(contact.outstanding_receivable_amount),
                        )
                    } catch (sendError) {
                        console.error(`Failed to send WhatsApp payment notification to ${phone} (language="${preferredLanguage}"):`, sendError)
                        allSucceeded = false
                    }
                }
                notified = allSucceeded
            } catch (notifyError) {
                console.error("Failed to send WhatsApp payment notification:", notifyError)
            }
        }

        res.status(201).json({payment, notified})
        return
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to record payment' });
        console.error('Error recording customer payment:', error);
        return
    }
};
