import type { Request, Response } from "express";
import { ZohoCreateInvoice, ZohoGetInvoiceById, ZohoUpdateInvoice } from "../../services/zoho/invoices/index.js";
import {
  replyWithAddedInvoiceItemsTelegramMessage,
  sendInvoiceTelegramMessage,
} from "../../services/telegram/invoices/index.js";
import { redisClient } from "../../config/redis.js";
import { excludeInternalLineItems, stripInternalMarker } from "../../utils/internalLineItems.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";

/**
 * Creates a new invoice, or — when `invoice_id` is given — replaces an
 * existing draft's line items with the ones supplied (the frontend's
 * "Update Draft" mode always sends the full desired set, never a delta).
 *
 * Either way the fulfillment channel is notified: a new invoice gets a fresh
 * message, an updated draft replies to its existing one so the thread holds a
 * single current version. Pass `skip_telegram` to write to Zoho only and
 * leave the channel untouched.
 */
export async function createInvoice(req: Request, res: Response) {
  const { contact_id, line_items, date, invoice_id, skip_telegram } = req.body ?? {};

  if (!contact_id || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({
      error: "contact_id and line_items (non-empty array) are required",
    });
  }

  const telegramLineItems = excludeInternalLineItems(line_items);
  const zohoLineItems = stripInternalMarker(line_items);

  try {
    const access_token = requireAccessToken(req, "A problem occured getting items");

    if (invoice_id) {
      await ZohoUpdateInvoice(access_token, String(invoice_id), {
        ...(date ? { date } : {}),
        line_items: zohoLineItems,
      });

      const invoice = await ZohoGetInvoiceById(access_token, String(invoice_id));

      if (!skip_telegram) {
        const allTelegramLineItems = excludeInternalLineItems(invoice.line_items);

        const existingMessageId = await redisClient.get(String(invoice.invoice_id));

        const telegramMessage = existingMessageId
          ? await replyWithAddedInvoiceItemsTelegramMessage(invoice, allTelegramLineItems, Number(existingMessageId))
          : await sendInvoiceTelegramMessage(invoice, allTelegramLineItems);

        await redisClient.set(String(invoice.invoice_id), String(telegramMessage.message_id));
      }

      res.status(200).json({ invoice, merged: true });
      return
    }

    const invoice = await ZohoCreateInvoice(access_token, {
      customer_id: contact_id,
      ...(date ? { date } : {}),
      line_items: zohoLineItems,
    });

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
