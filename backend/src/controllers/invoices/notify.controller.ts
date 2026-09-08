import type { Request, Response } from "express";
import { ZohoGetInvoiceById } from "../../services/zoho/invoices/index.js";
import { notifyInvoiceSent, notifyPaymentRecorded } from "../../services/whatsapp/invoices.js";
import { todayInBusinessTimezone } from "../../utils/businessDate.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";

/**
 * Re-sends a WhatsApp notification about this invoice, without repeating
 * whatever business action (recording a payment, marking as sent) triggered
 * it the first time — used when that first attempt's notification failed
 * and the user wants to try again, without risking a duplicate payment or
 * status change. `kind: "sent"` re-sends the invoice/balance notice off the
 * invoice's current state; `kind: "payment"` re-sends a payment confirmation
 * for a specific amount/date, since that isn't recoverable from the
 * invoice's state alone once other payments may have followed it.
 */
export async function resendInvoiceNotification(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured resending the notification");
    if (!id) throw new Error("id not provided");

    const { kind, notify_contact_ids, amount, date } = req.body ?? {};
    if (kind !== "sent" && kind !== "payment") throw new Error("kind must be 'sent' or 'payment'");
    if (kind === "payment" && !amount) throw new Error("amount is required to resend a payment notification");

    const invoice = await ZohoGetInvoiceById(access_token, id);

    const notified = kind === "sent"
      ? await notifyInvoiceSent(access_token, invoice, notify_contact_ids)
      : await notifyPaymentRecorded(access_token, invoice, Number(amount), date || todayInBusinessTimezone(), notify_contact_ids);

    res.status(200).json({ notified });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to resend notification",
    });
  }
}
