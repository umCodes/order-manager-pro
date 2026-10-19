import type { Request, Response } from "express";
import {
  ZohoGetInvoiceById,
  ZohoMarkInvoiceAsSent,
  ZohoMarkInvoiceAsVoid,
  recordInvoicePayment,
} from "../../services/zoho/invoices/index.js";
import { notifyInvoiceSent, notifyPaymentRecorded } from "../../services/whatsapp/invoices.js";
import { deleteInvoiceTelegramMessage } from "../../services/telegram/invoices/index.js";
import { todayInBusinessTimezone } from "../../utils/businessDate.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { addToCollectedToday } from "../../services/dailyTotals.js";
import { deleteCache } from "../../utils/cache.js";
import { recordReportInvoiceSent, recordReportPayment, removeReportInvoice } from "../../services/dailyReport/store.js";
import { confirmVisitByActivity } from "../../services/visits.js";
import { applyUnusedCredits } from "../../services/credits.js";

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

    const { amount, payment_mode, discount, notify, notify_contact_ids } = req.body ?? {};
    if (!amount) throw new Error("Amount not provided");

    const invoiceBeforePayment = await ZohoGetInvoiceById(access_token, id);
    const wasDraft = invoiceBeforePayment.status === "draft";

    const payment = await recordInvoicePayment(access_token, id, amount, payment_mode, discount);
    // The cached customer list carries each customer's balance due.
    deleteCache("customers");
    await addToCollectedToday(Number(amount));
    await recordReportPayment(payment, invoiceBeforePayment.customer_name);
    await confirmVisitByActivity(invoiceBeforePayment.customer_id, "payment");
    // Leftover credit from returns goes on what's still owed (before the balance is read for the notice).
    await applyUnusedCredits(access_token, invoiceBeforePayment.customer_id);
    // Paying a draft sends it: it becomes one of the day's sales.
    if (wasDraft) {
      await recordReportInvoiceSent({
        ...invoiceBeforePayment,
        balance: Math.max(0, Number(invoiceBeforePayment.total) - Number(amount) - (Number(discount) || 0)),
      });
    }

    // Once any payment is recorded the invoice is no longer pending
    // fulfillment, so its channel message (if one is still around) no longer applies.
    await deleteInvoiceTelegramMessage(id);

    let notified = { balance: false, payment: false };
    if (notify) {
      const invoiceAfterPayment = await ZohoGetInvoiceById(access_token, id);
      if (wasDraft) {
        notified.balance = await notifyInvoiceSent(access_token, invoiceAfterPayment, notify_contact_ids);
      }
      else {
        notified.payment = await notifyPaymentRecorded(
          access_token,
          invoiceAfterPayment,
          amount,
          payment.date ?? todayInBusinessTimezone(),
          notify_contact_ids,
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

    const { notify, notify_contact_ids } = req.body ?? {};

    await ZohoMarkInvoiceAsSent(access_token, id);
    // A sent invoice now counts toward the customer's balance due in the cached list.
    deleteCache("customers");
    await deleteInvoiceTelegramMessage(id);
    // Leftover credit from returns goes on the delivered invoice (and any other open ones), before it's read back.
    const before = await ZohoGetInvoiceById(access_token, id);
    const credits = await applyUnusedCredits(access_token, before.customer_id);
    const invoice = credits.length ? await ZohoGetInvoiceById(access_token, id) : before;
    await recordReportInvoiceSent(invoice);
    await confirmVisitByActivity(invoice.customer_id, "delivery");

    const notified = notify ? await notifyInvoiceSent(access_token, invoice, notify_contact_ids) : false;

    res.status(200).json({ invoice, notified });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to mark invoice as sent",
    });
  }
}

/**
 * Voids an invoice. It's no longer pending fulfillment either, so its
 * channel thread is cleared like a paid or sent invoice's.
 */
export async function voidInvoice(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured voiding the invoice");
    if (!id) throw new Error("id not provided");

    await ZohoMarkInvoiceAsVoid(access_token, id);
    await removeReportInvoice(id);
    // A voided invoice no longer counts toward the customer's balance due in the cached list.
    deleteCache("customers");
    await deleteInvoiceTelegramMessage(id);
    const invoice = await ZohoGetInvoiceById(access_token, id);

    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to void invoice",
    });
  }
}
