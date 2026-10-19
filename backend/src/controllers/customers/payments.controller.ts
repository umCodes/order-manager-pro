import type { Request, Response } from 'express';
import {
    recordCustomerPayment,
    ZohoGetCustomerById,
    ZohoGetCustomerPayments,
    ZohoGetCustomerPaymentById,
    ZohoUpdateCustomerPaymentAmount,
    ZohoDeleteCustomerPayment,
} from '../../services/zoho/customers/index.js';
import { ZohoGetCustomerCreditNotes } from '../../services/zoho/creditNotes.js';
import { notifyCustomerPayment, notifyPaymentCorrected, notifyPaymentDeleted } from '../../services/whatsapp/customers.js';
import { redisClient } from '../../config/redis.js';
import { recordReportPayment, removeReportPayment, reportDayOfPayment, updateReportPaymentAmount } from '../../services/dailyReport/store.js';
import { confirmVisitByActivity } from '../../services/visits.js';
import { businessDayKey, todayInBusinessTimezone } from '../../utils/businessDate.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import { addToCollectedToday, adjustCollectedToday } from '../../services/dailyTotals.js';
import { deleteCache } from '../../utils/cache.js';

/**
 * Records a payment against the customer as a whole, spread across their open
 * invoices oldest-first, with an optional discount placed on those invoices
 * first (oldest invoice that can take it whole, else spread oldest-first).
 * A discount with an amount of 0 records just the discount. The optional WhatsApp confirmation is best-effort
 * and can go to one or more contacts: a failure there is logged and reported
 * as `notified: false`, never rolled back onto the payment that already
 * went through.
 */
export async function payCustomerBalance(req: Request, res: Response){
    const { id } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured recording payment")
        if (!id) throw new Error("Customer id is required")
        const { payment_mode, notify, notify_contact_ids } = req.body;
        const amount = Number(req.body.amount) || 0
        const discount = Number(req.body.discount) || 0

        if (amount < 0 || discount < 0) throw new Error("Amount and discount can't be negative")
        if (!amount && !discount) throw new Error("Amount not provided")

        const { payment, discounts } = await recordCustomerPayment(access_token, id as string, amount, payment_mode, discount || undefined)
        // The cached customer list carries each customer's balance due.
        deleteCache("customers")
        if (amount) await addToCollectedToday(amount)
        if (payment) await recordReportPayment(payment)
        // A discount on its own isn't a payment, so it doesn't confirm a visit.
        if (payment) await confirmVisitByActivity(id as string, "payment")

        // A discount on its own isn't a payment to confirm to the customer.
        const notified = notify && payment
            ? await notifyCustomerPayment(access_token, id as string, amount, payment.date ?? todayInBusinessTimezone(), notify_contact_ids)
            : false

        res.status(201).json({payment, discounts, notified})
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

/**
 * What a payment edit or delete changed, kept for a week so its WhatsApp
 * message can be re-sent (after a failure, or later) without the client
 * supplying the amounts — a deleted payment can't be read back from Zoho.
 */
type PaymentChange =
    | { kind: "correction"; customer_id: string; payment_number: string; old_amount: number; new_amount: number }
    | { kind: "deletion"; customer_id: string; payment_number: string }

const paymentChangeKey = (paymentId: string) => `payment-change:${paymentId}`
const PAYMENT_CHANGE_TTL_SECONDS = 7 * 24 * 60 * 60

async function savePaymentChange(paymentId: string, change: PaymentChange) {
    try {
        await redisClient.set(paymentChangeKey(paymentId), JSON.stringify(change), { EX: PAYMENT_CHANGE_TTL_SECONDS })
    } catch (error) {
        console.error('Failed to record payment change:', error)
    }
}

function notifyPaymentChange(accessToken: string, change: PaymentChange, contactIds?: string[]) {
    return change.kind === "correction"
        ? notifyPaymentCorrected(accessToken, change.customer_id, change.payment_number, change.old_amount, change.new_amount, contactIds)
        : notifyPaymentDeleted(accessToken, change.customer_id, change.payment_number, contactIds)
}

/**
 * A change to a payment collected in the current business day (4am to 4am)
 * also moves today's collected total. Which business day a payment belongs
 * to comes from when it was recorded (the daily report keeps that), not its
 * Zoho date: Zoho dates by calendar day, so a payment made at 1am carries
 * the next date while still counting toward the previous business day.
 * Payments recorded before that existed fall back to their Zoho date.
 */
async function adjustTodayFor(paymentId: string, paymentDate: string, delta: number) {
    const recordedDay = await reportDayOfPayment(paymentId)
    if ((recordedDay ?? paymentDate) === businessDayKey()) await adjustCollectedToday(delta)
}

/**
 * Corrects a payment's amount (body: `{ amount, notify?, notify_contact_ids? }`),
 * re-spreading it over the customer's invoices (see
 * ZohoUpdateCustomerPaymentAmount). The optional WhatsApp "payment
 * correction" message is best-effort, like the payment confirmation.
 */
export async function updateCustomerPayment(req: Request, res: Response) {
    const id = req.params.id as string
    const paymentId = req.params.paymentId as string

    try {
        const access_token = requireAccessToken(req, "A problem occured updating the payment")
        if (!id || !paymentId) throw new Error("Customer id and payment id are required")
        const amount = Math.round(Number(req.body?.amount) * 100) / 100
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount more than 0")
        const { notify, notify_contact_ids } = req.body ?? {}

        const { before, after } = await ZohoUpdateCustomerPaymentAmount(access_token, id, paymentId, amount)
        deleteCache("customers")
        const oldAmount = Number(before.amount)
        await adjustTodayFor(paymentId, before.date, amount - oldAmount)
        await updateReportPaymentAmount(paymentId, amount)

        const change: PaymentChange = {
            kind: "correction",
            customer_id: id,
            payment_number: before.payment_number ?? "",
            old_amount: oldAmount,
            new_amount: amount,
        }
        await savePaymentChange(paymentId, change)
        const notified = notify ? await notifyPaymentChange(access_token, change, notify_contact_ids) : false

        res.status(200).json({ payment: after, notified })
    } catch (error) {
        console.error('Error updating customer payment:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update the payment' });
    }
};

/**
 * Deletes a payment (body: `{ notify?, notify_contact_ids? }`); the invoices
 * it paid go back to owing that amount. The optional WhatsApp "payment
 * deletion" message is best-effort.
 */
export async function deleteCustomerPayment(req: Request, res: Response) {
    const id = req.params.id as string
    const paymentId = req.params.paymentId as string

    try {
        const access_token = requireAccessToken(req, "A problem occured deleting the payment")
        if (!id || !paymentId) throw new Error("Customer id and payment id are required")
        const { notify, notify_contact_ids } = req.body ?? {}

        const deleted = await ZohoDeleteCustomerPayment(access_token, id, paymentId)
        deleteCache("customers")
        await adjustTodayFor(paymentId, deleted.date, -Number(deleted.amount))
        await removeReportPayment(paymentId)

        const change: PaymentChange = { kind: "deletion", customer_id: id, payment_number: deleted.payment_number ?? "" }
        await savePaymentChange(paymentId, change)
        const notified = notify ? await notifyPaymentChange(access_token, change, notify_contact_ids) : false

        res.status(200).json({ notified })
    } catch (error) {
        console.error('Error deleting customer payment:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to delete the payment' });
    }
};

/** Re-sends the WhatsApp message for a payment's last edit or deletion (kept for a week). */
export async function resendPaymentChangeNotification(req: Request, res: Response) {
    const id = req.params.id as string
    const paymentId = req.params.paymentId as string

    try {
        const access_token = requireAccessToken(req, "A problem occured sending the notification")
        const raw = await redisClient.get(paymentChangeKey(paymentId))
        if (!raw) throw new Error("There's no recent change to this payment to send")
        const change = JSON.parse(raw) as PaymentChange
        if (change.customer_id !== id) throw new Error("Payment does not belong to this customer")

        const notified = await notifyPaymentChange(access_token, change, req.body?.notify_contact_ids)
        res.status(200).json({ notified })
    } catch (error) {
        console.error('Error re-sending payment change notification:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to send notification' });
    }
};
