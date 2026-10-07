import type { Request, Response } from 'express';
import {
    recordCustomerPayment,
    ZohoGetCustomerById,
    ZohoGetCustomerPayments,
    ZohoGetCustomerPaymentById,
} from '../../services/zoho/customers/index.js';
import { ZohoGetCustomerCreditNotes } from '../../services/zoho/creditNotes.js';
import { notifyCustomerPayment } from '../../services/whatsapp/customers.js';
import { todayInBusinessTimezone } from '../../utils/businessDate.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import { addToCollectedToday } from '../../services/dailyTotals.js';
import { deleteCache } from '../../utils/cache.js';

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
        // The cached customer list carries each customer's balance due.
        deleteCache("customers")
        await addToCollectedToday(Number(amount))

        const notified = notify
            ? await notifyCustomerPayment(access_token, id as string, Number(amount), payment.date ?? todayInBusinessTimezone(), notify_contact_ids)
            : false

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

/** The customer's payments, newest first. */
export async function getCustomerPayments(req: Request, res: Response){
    const id = req.params.id as string

    try {
        const access_token = requireAccessToken(req, "A problem occured fetching payments")
        if (!id) throw new Error("Customer id is required")

        const customer = await ZohoGetCustomerById(access_token, id)
        const [payments, returnCredits] = await Promise.all([
            ZohoGetCustomerPayments(access_token, id, customer.contact_name),
            // A failure here shouldn't hide the payments themselves.
            ZohoGetCustomerCreditNotes(access_token, id).catch((error) => {
                console.error('Error fetching customer credit notes:', error)
                return []
            }),
        ])
        res.status(200).json({
            // Payments and returns' credits in one list, newest first: a return's
            // credit lowers the balance like a payment does.
            payments: [
                ...payments.map((p) => ({
                    payment_id: p.payment_id,
                    payment_number: p.payment_number,
                    date: p.date,
                    amount: p.amount,
                    payment_mode: p.payment_mode,
                    kind: "payment" as const,
                })),
                ...returnCredits
                    .filter((note) => String(note.customer_id ?? id) === id && note.status !== "void" && note.status !== "draft")
                    // Only the part of the return's credit actually used against invoices.
                    .map((note) => ({ note, used: Math.round((note.total - (note.balance ?? 0)) * 100) / 100 }))
                    .filter(({ used }) => used > 0)
                    .map(({ note, used }) => ({
                        payment_id: `creditnote-${note.creditnote_id}`,
                        payment_number: note.creditnote_number,
                        date: note.date,
                        amount: used,
                        kind: "return_credit" as const,
                    })),
            ].sort((a, b) => b.date.localeCompare(a.date)),
        })
    } catch (error) {
        console.error('Error fetching customer payments:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to fetch payments' });
    }
};

/**
 * Sends the payment confirmation template for one of this customer's
 * existing payments, on demand — nothing about the payment changes. The
 * amount and date come from the payment itself (never the client), and the
 * payment must belong to this customer.
 */
export async function sendCustomerPaymentNotification(req: Request, res: Response){
    const id = req.params.id as string
    const paymentId = req.params.paymentId as string

    try {
        const access_token = requireAccessToken(req, "A problem occured sending the notification")
        if (!id || !paymentId) throw new Error("Customer id and payment id are required")
        const { notify_contact_ids } = req.body ?? {}

        const payment = await ZohoGetCustomerPaymentById(access_token, paymentId)
        if (String(payment.customer_id) !== id) throw new Error("Payment does not belong to this customer")

        const notified = await notifyCustomerPayment(access_token, id, Number(payment.amount), payment.date, notify_contact_ids)
        res.status(200).json({ notified })
    } catch (error) {
        console.error('Error sending customer payment notification:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to send notification' });
    }
};
