import type { Request, Response } from "express";
import { ZohoGetInvoiceById, ZohoUpdateInvoice } from "../../services/zoho/invoices/index.js";
import { heldInvoice, postOrHoldInvoiceTelegramMessage, retireInvoiceTelegramThread } from "../../services/telegram/invoices/index.js";
import { businessDayKey } from "../../utils/businessDate.js";
import { excludeInternalLineItems } from "../../utils/internalLineItems.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { sortLineItemsByCategory } from "../../services/lineItemOrder.js";
import { invoiceUpdateReason } from "../../utils/invoiceUpdateReason.js";

/**
 * Posts the invoice to the channel again as a brand-new message (rather than
 * editing the old one) and reschedules it to `date`, or to the current business
 * day (4am to 4am) when none is given — used when a message needs to resurface for the fulfillment team.
 * The messages already posted are taken down first (see retireInvoiceTelegramThread).
 * Rescheduled to a later day, the new message is held for that day instead of
 * posted (see telegram/invoices/schedule.ts).
 */
export async function resendInvoiceTelegramMessage(req: Request, res: Response) {
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    const access_token = requireAccessToken(req, "A problem occured resending the invoice");
    if (!id) throw new Error("id not provided");

    const newDate = date || businessDayKey();
    await ZohoUpdateInvoice(access_token, id, { date: newDate, reason: invoiceUpdateReason(undefined, `Rescheduled to ${newDate}`) });

    const invoice = await ZohoGetInvoiceById(access_token, id);

    if (!date) invoice.date = undefined

    // Invoices created before category sorting may be in any order.
    const telegramLineItems = excludeInternalLineItems(await sortLineItemsByCategory(access_token, invoice.line_items));

    if (!(await heldInvoice(id))) await retireInvoiceTelegramThread(id, newDate);
    const telegram_held = await postOrHoldInvoiceTelegramMessage(invoice, telegramLineItems);

    res.status(200).json({ invoice, telegram_held });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to resend invoice",
    });
  }
}
