import type { Request, Response } from "express";
import { ZohoCreateInvoice, ZohoGetInvoiceById, ZohoUpdateInvoice } from "../../services/zoho/invoices/index.js";
import {
  heldInvoice,
  holdInvoiceMessage,
  isLaterDay,
  postOrHoldInvoiceTelegramMessage,
  releaseHeldInvoice,
  replyWithInvoiceChangesTelegramMessage,
  retireInvoiceTelegramThread,
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
 * Dated a later day, the message isn't posted yet but held for that day
 * (see telegram/invoices/schedule.ts). A held draft that's updated stays
 * held (moved, if its date changed), or is posted now once it's for today;
 * a posted one moved to a later day has its messages taken down and is held.
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
      const id = String(invoice_id);
      const held = await heldInvoice(id);
      // The channel thread is told only what changed, so it needs the items as they were.
      const existingMessageId = held ? null : await redisClient.get(id);
      const previousInvoice = existingMessageId && !skip_telegram ? await ZohoGetInvoiceById(access_token, id) : null;

      await ZohoUpdateInvoice(access_token, id, {
        ...(date ? { date } : {}),
        line_items: zohoLineItems,
      });

      const invoice = await ZohoGetInvoiceById(access_token, id);
      await refreshReportInvoice(invoice);
      void notifyGeneralItems(invoice);

      const allTelegramLineItems = excludeInternalLineItems(invoice.line_items);
      let telegram_held = null;

      if (held) {
        // Nothing posted yet: the held message is read from Zoho when it goes out.
        if (isLaterDay(invoice.date)) telegram_held = await holdInvoiceMessage(invoice);
        else if (skip_telegram) await releaseHeldInvoice(id);
        else await postOrHoldInvoiceTelegramMessage(invoice, allTelegramLineItems);
      } else if (!skip_telegram) {
        const movedToLaterDay = !!existingMessageId && !!date && date !== previousInvoice?.date && isLaterDay(invoice.date);

        if (movedToLaterDay) {
          await retireInvoiceTelegramThread(id, invoice.date);
          telegram_held = await holdInvoiceMessage(invoice);
        } else if (existingMessageId && previousInvoice) {
          const telegramMessage = await replyWithInvoiceChangesTelegramMessage(
            invoice,
            excludeInternalLineItems(previousInvoice.line_items),
            allTelegramLineItems,
            Number(existingMessageId),
          );
          // No message means the items didn't change — the current one still stands.
          if (telegramMessage) await redisClient.set(id, String(telegramMessage.message_id));
        } else {
          telegram_held = await postOrHoldInvoiceTelegramMessage(invoice, allTelegramLineItems);
        }
      }

      res.status(200).json({ invoice, merged: true, telegram_held });
      return
    }

    const invoice = await ZohoCreateInvoice(access_token, {
      customer_id: contact_id,
      date: date || businessDayKey(),
      due_date: await newInvoiceDueDate(),
      line_items: zohoLineItems,
    });

    await recordReportDraft(invoice);
    // A copy: the date is cleared just below for Telegram, but the notice says the day.
    void notifyGeneralItems({ ...invoice });
    if (!date) invoice.date = undefined

    const telegram_held = skip_telegram ? null : await postOrHoldInvoiceTelegramMessage(invoice, telegramLineItems);

    res.status(201).json({ invoice, merged: false, telegram_held });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Failed to create invoice" });
  }
}
