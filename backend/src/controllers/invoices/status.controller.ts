import type { Request, Response } from "express";
import {
  ZohoGetInvoiceById,
  ZohoMarkInvoiceAsSent,
  recordInvoicePayment,
} from "../../services/zoho/invoices/index.js";
import { notifyInvoiceSent, notifyPaymentRecorded } from "../../services/whatsapp/invoices.js";
import { todayInBusinessTimezone } from "../../utils/businessDate.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";

/**
 * Records a payment against one invoice, optionally applying a discount
 * first. Which WhatsApp notification the customer gets depends on where the
 * invoice started: paying a draft effectively sends it (balance notice with
 * the PDF), while paying an already-sent invoice sends a payment receipt.
 */
export async function payInvoiceBalance(req: Request, res: Response) {
  const id  = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured recording payment");
    if (!id) throw new Error("id not provided");

    const { amount, payment_mode, discount, notify, notify_contact_id } = req.body ?? {};
    if (!amount) throw new Error("Amount not provided");

    const invoiceBeforePayment = await ZohoGetInvoiceById(access_token, id);
    const wasDraft = invoiceBeforePayment.status === "draft";

    const payment = await recordInvoicePayment(access_token, id, amount, payment_mode, discount);

    let notified = { balance: false, payment: false };
    if (notify) {
      const invoiceAfterPayment = await ZohoGetInvoiceById(access_token, id);
      if (wasDraft) {
        notified.balance = await notifyInvoiceSent(access_token, invoiceAfterPayment, notify_contact_id);
      }
      else {
        notified.payment = await notifyPaymentRecorded(
          access_token,
          invoiceAfterPayment,
          amount,
          payment.date ?? todayInBusinessTimezone(),
          notify_contact_id,
        );
      }
    }

    res.status(201).json({ payment, notified });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to record payment",
    });
  }
}

/** Moves a draft to "sent" in Zoho, optionally WhatsApp-ing the customer the invoice and their balance. */
export async function markInvoiceAsSent(req: Request, res: Response) {
  const id  = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured marking the invoice as sent");
    if (!id) throw new Error("id not provided");

    const { notify, notify_contact_id } = req.body ?? {};

    await ZohoMarkInvoiceAsSent(access_token, id);
    const invoice = await ZohoGetInvoiceById(access_token, id);

    const notified = notify ? await notifyInvoiceSent(access_token, invoice, notify_contact_id) : false;

    res.status(200).json({ invoice, notified });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to mark invoice as sent",
    });
  }
}
