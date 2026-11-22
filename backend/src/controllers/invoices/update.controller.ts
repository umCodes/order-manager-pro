import type { Request, Response } from "express";
import {
  ZohoGetInvoiceById,
  ZohoUpdateInvoice,
  splitInvoiceToSelectedItems,
} from "../../services/zoho/invoices/index.js";
import {
  heldInvoice,
  postOrHoldInvoiceTelegramMessage,
  retireInvoiceTelegramThread,
} from "../../services/telegram/invoices/index.js";
import { redisClient } from "../../config/redis.js";
import { businessDayKey } from "../../utils/businessDate.js";
import { excludeInternalLineItems } from "../../utils/internalLineItems.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { deleteCache } from "../../utils/cache.js";
import { invoiceUpdateReason } from "../../utils/invoiceUpdateReason.js";
import { sortLineItemsByCategory } from "../../services/lineItemOrder.js";
import { recordReportDraft, refreshReportInvoice } from "../../services/dailyReport/store.js";

/**
 * Moves an invoice to another day. Its Telegram message follows (see
 * telegram/invoices/schedule.ts): one still held is moved to the new day, or
 * posted now once it's for today; one already posted is taken down (see
 * retireInvoiceTelegramThread) and posted again now, or held when the new
 * day is a later one. An unchanged date leaves Telegram alone. An empty date
 * resets it to the current business day (4am to 4am).
 */
export async function updateInvoiceDate(req: Request, res: Response) {
  const id  = req.params.id as string;
  const date = req.body.date;
  const reason = req.body.reason;

  try {
    const access_token = requireAccessToken(req, "A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    const held = await heldInvoice(id);
    const existingMessageId = held ? null : await redisClient.get(id);
    const previousDate = existingMessageId ? (await ZohoGetInvoiceById(access_token, id))?.date : null;

    const newDate = date || businessDayKey();
    await ZohoUpdateInvoice(access_token, id, {
      date: newDate,
      reason: invoiceUpdateReason(reason, `Date changed to ${newDate}`),
    });
    const invoice = await ZohoGetInvoiceById(access_token, id);

    if (!date) invoice.date = undefined

    const telegramLineItems = excludeInternalLineItems(invoice.line_items);
    let telegram_held = held;

    if (held || !existingMessageId) {
      telegram_held = await postOrHoldInvoiceTelegramMessage(invoice, telegramLineItems);
    } else if (previousDate !== newDate) {
      await retireInvoiceTelegramThread(id, newDate);
      telegram_held = await postOrHoldInvoiceTelegramMessage(invoice, telegramLineItems);
    }

    await refreshReportInvoice(invoice);
    res.status(200).json({ invoice, telegram_held });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update invoice date",
    });
  }
}

/**
 * Persists edited line items on an existing invoice. Zoho's PUT invoices/{id}
 * replaces the entire line_items array, so callers must always send the full
 * current set of line items, not just the edited ones. Deliberately has no
 * Telegram/Redis side effects, unlike createInvoice's update path — this is a
 * quiet correction, not a re-send. `reason` is forwarded to Zoho, which
 * requires it once the invoice is no longer a draft. Line items are sorted
 * by category priority, then name.
 */
export async function updateInvoiceLineItems(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    const { line_items, reason } = req.body ?? {};
    if (!Array.isArray(line_items) || line_items.length === 0) {
      throw new Error("line_items (non-empty array) is required");
    }

    const sortedLineItems = await sortLineItemsByCategory(access_token, line_items);
    const zohoLineItems = sortedLineItems.map((item: any) => ({
      item_id: item.item_id,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      unit: item.unit,
    }));

    const invoice = await ZohoUpdateInvoice(access_token, id, {
      line_items: zohoLineItems,
      reason: invoiceUpdateReason(reason, "Items updated"),
    });
    // A sent invoice's total is part of the customer's balance due in the cached list.
    if (invoice.status !== "draft") deleteCache("customers");

    await refreshReportInvoice(invoice);
    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update invoice line items",
    });
  }
}

/**
 * Reassigns an invoice to a different customer, e.g. when it was created
 * against the wrong contact. `reason` is forwarded to Zoho, which requires
 * it once the invoice is no longer a draft.
 */
export async function updateInvoiceCustomer(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured updating the invoice customer");
    if (!id) throw new Error("id not provided");

    const { customer_id, reason } = req.body ?? {};
    if (!customer_id) throw new Error("customer_id not provided");

    await ZohoUpdateInvoice(access_token, id, { customer_id, reason: invoiceUpdateReason(reason, "Customer changed") });
    const invoice = await ZohoGetInvoiceById(access_token, id);
    // Moving a sent invoice shifts balance due between two customers in the cached list.
    if (invoice.status !== "draft") deleteCache("customers");

    await refreshReportInvoice(invoice);
    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update invoice customer",
    });
  }
}

/**
 * Trims an invoice down to the selected line items. With `create_new_draft`
 * the leftovers become a new draft, which gets its own channel message
 * (held, when it's for a later day).
 */
export async function splitInvoice(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured splitting the invoice");
    if (!id) throw new Error("id not provided");

    const { selected_line_item_ids, create_new_draft } = req.body ?? {};
    if (!Array.isArray(selected_line_item_ids) || selected_line_item_ids.length === 0) {
      throw new Error("selected_line_item_ids (non-empty array) is required");
    }

    const { invoice, newDraft } = await splitInvoiceToSelectedItems(
      access_token,
      id,
      selected_line_item_ids.map(String),
      !!create_new_draft,
    );

    await refreshReportInvoice(invoice);
    if (newDraft) {
      await recordReportDraft(newDraft);
      const newDraftTelegramLineItems = excludeInternalLineItems(newDraft.line_items);
      await postOrHoldInvoiceTelegramMessage(newDraft, newDraftTelegramLineItems);
    }

    res.status(200).json({ invoice, newDraft });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to split invoice",
    });
  }
}
