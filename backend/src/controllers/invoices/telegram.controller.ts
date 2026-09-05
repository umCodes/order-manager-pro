import type { Request, Response } from "express";
import { ZohoGetInvoiceById, ZohoUpdateInvoice } from "../../services/zoho/invoices/index.js";
import { sendInvoiceTelegramMessage } from "../../services/telegram/invoices/index.js";
import { redisClient } from "../../config/redis.js";
import { todayInBusinessTimezone } from "../../utils/businessDate.js";
import { excludeInternalLineItems } from "../../utils/internalLineItems.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";

/**
 * Posts the invoice to the channel again as a brand-new message (rather than
 * editing the old one) and reschedules it to `date`, or to today when none is
 * given — used when a message needs to resurface for the fulfillment team.
 */
export async function resendInvoiceTelegramMessage(req: Request, res: Response) {
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    const access_token = requireAccessToken(req, "A problem occured resending the invoice");
    if (!id) throw new Error("id not provided");

    await ZohoUpdateInvoice(access_token, id, { date: date || todayInBusinessTimezone() });

    const invoice = await ZohoGetInvoiceById(access_token, id);

    if (!date) invoice.date = undefined

    const telegramLineItems = excludeInternalLineItems(invoice.line_items);

    const telegramMessage = await sendInvoiceTelegramMessage(invoice, telegramLineItems);
    await redisClient.set(String(invoice.invoice_id), String(telegramMessage.message_id));

    res.status(200).json({ message: telegramMessage, invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to resend invoice",
    });
  }
}
