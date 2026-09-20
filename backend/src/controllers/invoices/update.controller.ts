import type { Request, Response } from "express";
import {
  ZohoAddInvoiceComment,
  ZohoGetInvoiceById,
  ZohoUpdateInvoice,
  splitInvoiceToSelectedItems,
} from "../../services/zoho/invoices/index.js";
import {
  sendInvoiceTelegramMessage,
  updateInvoiceDateTelegramMessage,
} from "../../services/telegram/invoices/index.js";
import { redisClient } from "../../config/redis.js";
import { todayInBusinessTimezone } from "../../utils/businessDate.js";
import { excludeInternalLineItems } from "../../utils/internalLineItems.js";
import { requireAccessToken } from "../../utils/requireAccessToken.js";

/**
 * Edits below a "sent" invoice (anything past draft) are exceptional — the
 * customer may already have this invoice in hand — so a non-empty reason is
 * required and recorded as a Zoho comment. A draft edit needs neither.
 */
function requireReasonIfSent(status: string, reason: unknown): string {
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (status !== "draft" && !trimmed) {
    throw new Error("A reason is required when updating a sent invoice");
  }
  return trimmed;
}

/**
 * Reschedules an invoice and edits its existing channel message in place, so
 * the team sees the new day on the original message rather than a duplicate.
 * An empty date resets it to today. When the message couldn't be edited a
 * fresh one is sent and its id stored instead.
 */
export async function updateInvoiceDate(req: Request, res: Response) {
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    const access_token = requireAccessToken(req, "A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    const existing = await ZohoGetInvoiceById(access_token, id);
    const wasSent = existing.status !== "draft";
    const reason = requireReasonIfSent(existing.status, req.body.reason);

    await ZohoUpdateInvoice(access_token, id, { date: date || todayInBusinessTimezone() });
    if (wasSent) await ZohoAddInvoiceComment(access_token, id, `Date changed: ${reason}`);
    const invoice = await ZohoGetInvoiceById(access_token, id);

    if (!date) invoice.date = undefined

    const telegramLineItems = excludeInternalLineItems(invoice.line_items);

    const existingMessageId = await redisClient.get(String(invoice.invoice_id));

    const { message, edited } = await updateInvoiceDateTelegramMessage(
      invoice,
      telegramLineItems,
      existingMessageId ? Number(existingMessageId) : null,
    );

    if (!edited) {
      await redisClient.set(String(invoice.invoice_id), String(message.message_id));
    }

    res.status(200).json({ invoice });
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
 * quiet correction, not a re-send. If the invoice is already sent, a `reason`
 * is required and logged as a Zoho comment.
 */
export async function updateInvoiceLineItems(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    const { line_items, reason: rawReason } = req.body ?? {};
    if (!Array.isArray(line_items) || line_items.length === 0) {
      throw new Error("line_items (non-empty array) is required");
    }

    const existing = await ZohoGetInvoiceById(access_token, id);
    const wasSent = existing.status !== "draft";
    const reason = requireReasonIfSent(existing.status, rawReason);

    const zohoLineItems = line_items.map((item: any) => ({
      item_id: item.item_id,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      unit: item.unit,
    }));

    const invoice = await ZohoUpdateInvoice(access_token, id, { line_items: zohoLineItems });
    if (wasSent) await ZohoAddInvoiceComment(access_token, id, `Line items changed: ${reason}`);

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
 * against the wrong contact. If the invoice is already sent, a `reason` is
 * required and logged as a Zoho comment.
 */
export async function updateInvoiceCustomer(req: Request, res: Response) {
  const id = req.params.id as string;

  try {
    const access_token = requireAccessToken(req, "A problem occured updating the invoice customer");
    if (!id) throw new Error("id not provided");

    const { customer_id, reason: rawReason } = req.body ?? {};
    if (!customer_id) throw new Error("customer_id not provided");

    const existing = await ZohoGetInvoiceById(access_token, id);
    const wasSent = existing.status !== "draft";
    const reason = requireReasonIfSent(existing.status, rawReason);

    await ZohoUpdateInvoice(access_token, id, { customer_id });
    if (wasSent) await ZohoAddInvoiceComment(access_token, id, `Customer changed: ${reason}`);
    const invoice = await ZohoGetInvoiceById(access_token, id);

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
 * the leftovers become a new draft, which gets its own channel message.
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

    if (newDraft) {
      const newDraftTelegramLineItems = excludeInternalLineItems(newDraft.line_items);
      const telegramMessage = await sendInvoiceTelegramMessage(newDraft, newDraftTelegramLineItems);
      await redisClient.set(String(newDraft.invoice_id), String(telegramMessage.message_id));
    }

    res.status(200).json({ invoice, newDraft });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to split invoice",
    });
  }
}
