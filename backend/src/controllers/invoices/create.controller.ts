import type { Request, Response } from "express";
import { ZohoCreateInvoice, ZohoGetInvoiceById, ZohoUpdateInvoice } from "../../services/zoho/invoices/index.js";
import {
  replyWithInvoiceChangesTelegramMessage,
  sendInvoiceTelegramMessage,
} from "../../services/telegram/invoices/index.js";
import { redisClient } from "../../config/redis.js";
import { excludeInternalLineItems, stripInternalMarker } from "../../utils/internalLineItems.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { sortLineItemsByCategory } from "../../services/lineItemOrder.js";
import { newInvoiceDueDate } from "../../services/invoiceDueDate.js";
import { recordReportDraft, refreshReportInvoice } from "../../services/dailyReport/store.js";
import { businessDayKey } from "../../utils/businessDate.js";
import { notifyGeneralItems } from "../../services/generalItemsWhatsApp.js";

/**
 * Creates a new invoice, or — when `invoice_id` is given — replaces an
 * existing draft's line items with the ones supplied (the frontend's
 * "Update Draft" mode always sends the full desired set, never a delta).
 *
 * Either way the fulfillment channel is notified: a new invoice gets a fresh
 * message, an updated draft replies to its existing one with only what
 * changed (and marks that one as changed, leaving it otherwise as posted). Pass `skip_telegram` to write to Zoho only and
 * leave the channel untouched. Line items are sorted by category priority,
 * then name, before either sees them. A new invoice without a date is dated
 * the current business day (4am to 4am), not Zoho's calendar day — a draft
 * made at 1am belongs to the day still being worked.
 *
 * General item lines new to the invoice are sent on WhatsApp in the
 * background (see generalItemsWhatsApp.ts), whether or not Telegram is.
 */
export async function createInvoice(req: Request, res: Response) {
  const { contact_id, line_items, date, invoice_id, skip_telegram } = req.body ?? {};

  if (!contact_id || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({
      error: "contact_id and line_items (non-empty array) are required",
    });
  }

  try {
    const access_token = requireAccessToken(req, "A problem occured getting items");

    const sortedLineItems = await sortLineItemsByCategory(access_token, line_items);
    const telegramLineItems = excludeInternalLineItems(sortedLineItems);
    const zohoLineItems = stripInternalMarker(sortedLineItems);

    if (invoice_id) {
      // The channel thread is told only what changed, so it needs the items as they were.
      const existingMessageId = skip_telegram ? null : await redisClient.get(String(invoice_id));
      const previousInvoice = existingMessageId ? await ZohoGetInvoiceById(access_token, String(invoice_id)) : null;

      await ZohoUpdateInvoice(access_token, String(invoice_id), {
        ...(date ? { date } : {}),
        line_items: zohoLineItems,
      });

      const invoice = await ZohoGetInvoiceById(access_token, String(invoice_id));
      await refreshReportInvoice(invoice);
      void notifyGeneralItems(invoice);

      if (!skip_telegram) {
        const allTelegramLineItems = excludeInternalLineItems(invoice.line_items);

        const telegramMessage = existingMessageId && previousInvoice
          ? await replyWithInvoiceChangesTelegramMessage(
              invoice,
              excludeInternalLineItems(previousInvoice.line_items),
              allTelegramLineItems,
              Number(existingMessageId),
            )
          : await sendInvoiceTelegramMessage(invoice, allTelegramLineItems);

        // No message means the items didn't change — the current one still stands.
        if (telegramMessage) {
          await redisClient.set(String(invoice.invoice_id), String(telegramMessage.message_id));
        }
      }

      res.status(200).json({ invoice, merged: true });
      return
    }

    const invoice = await ZohoCreateInvoice(access_token, {
      customer_id: contact_id,
      date: date || businessDayKey(),
      due_date: await newInvoiceDueDate(),
      line_items: zohoLineItems,
    });

    await recordReportDraft(invoice);
    void notifyGeneralItems(invoice);
    if (!date) invoice.date = undefined

    if (!skip_telegram) {
      const telegramMessage = await sendInvoiceTelegramMessage(invoice, telegramLineItems);
      await redisClient.set(String(invoice.invoice_id), String(telegramMessage.message_id));
    }

    res.status(201).json({ invoice, merged: false });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Failed to create invoice" });
  }
}
