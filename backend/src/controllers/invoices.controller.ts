import type { Request, Response } from "express";
import { ZohoCreateInvoice, ZohoGetDrafts, ZohoGetInvoiceById, ZohoUpdateInvoice, ZohoMarkInvoiceAsSent, recordInvoicePayment, splitInvoiceToSelectedItems } from "../services/zoho/invoices.js";
import { sendInvoiceTelegramMessage, updateInvoiceDateTelegramMessage, replyWithAddedInvoiceItemsTelegramMessage } from "../services/telegram/invoices.js";
import { notifyPaymentRecorded, notifyInvoiceSent } from "../services/whatsapp/invoices.js";
import { ZohoGetCustomerById, getContactPreferredLanguage } from "../services/zoho/customers.js";
import { createInvoicePdfBufferForLanguage, toInvoicePdfData } from "../utils/pdf.js";
import { redisClient } from "../config/redis.js";
import { todayInBusinessTimezone } from "../utils/businessDate.js";

export async function createInvoice(req: Request, res: Response) {

  const access_token = req.headers["Authorization"]

  const { contact_id, line_items, date, invoice_id } = req.body ?? {};

  if (!contact_id || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({
      error: "contact_id and line_items (non-empty array) are required",
    });
  }

  const telegramLineItems = line_items.filter(
    (item: any) => !String(item?.description ?? "").includes("###")
  );

  const zohoLineItems = line_items.map((item: any) => ({
    ...item,
    description: String(item?.description ?? "").replace(/###/g, ""),
  }));

  try {
    if (!access_token || access_token instanceof Array) throw "A problem occured getting items"

    if (invoice_id) {
      await ZohoUpdateInvoice(access_token, String(invoice_id), {
        ...(date ? { date } : {}),
        line_items: zohoLineItems,
      });

      const invoice = await ZohoGetInvoiceById(access_token, String(invoice_id));

      const allTelegramLineItems = invoice.line_items.filter(
        (item: any) => !String(item?.description ?? "").includes("###")
      );

      const existingMessageId = await redisClient.get(String(invoice.invoice_id));

      const telegramMessage = existingMessageId
        ? await replyWithAddedInvoiceItemsTelegramMessage(invoice, allTelegramLineItems, Number(existingMessageId))
        : await sendInvoiceTelegramMessage(invoice, allTelegramLineItems);

      await redisClient.set(String(invoice.invoice_id), String(telegramMessage.message_id));

      res.status(200).json({ invoice, merged: true });
      return
    }

    const invoice = await ZohoCreateInvoice(access_token, {
      customer_id: contact_id,
      ...(date ? { date } : {}),
      line_items: zohoLineItems,
    });
    
    if (!date) invoice.date = undefined

    const telegramMessage = await sendInvoiceTelegramMessage(invoice, telegramLineItems);
    await redisClient.set(String(invoice.invoice_id), String(telegramMessage.message_id));

    res.status(201).json({ invoice, merged: false });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Failed to create invoice" });
  }
}

export async function getDraftInvoices(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting draft invoices");

    const drafts = await ZohoGetDrafts(access_token);
    res.status(200).json({ drafts });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}

export async function getInvoiceById(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting the invoice");
    if (!id) throw new Error("id not provided");

    const invoice = await ZohoGetInvoiceById(access_token, id);
    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}

/**
 * Streams the invoice PDF (same classic template used for the WhatsApp
 * notification) inline, so the frontend can open it in a new tab and the
 * browser's native print dialog is right there. Falls back to "am" if the
 * invoice has no linked customer to resolve a preferred language from.
 */
export async function getInvoicePdf(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting the invoice PDF");
    if (!id) throw new Error("id not provided");

    const invoice = await ZohoGetInvoiceById(access_token, id);

    const preferredLanguage = invoice.customer_id
      ? getContactPreferredLanguage(await ZohoGetCustomerById(access_token, String(invoice.customer_id)))
      : "am";

    const pdf = await createInvoicePdfBufferForLanguage(toInvoicePdfData(invoice), preferredLanguage);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_number}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate invoice PDF",
    });
  }
}

export async function updateInvoiceDate(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    await ZohoUpdateInvoice(access_token, id, { date: date || todayInBusinessTimezone() });
    const invoice = await ZohoGetInvoiceById(access_token, id);

    if (!date) invoice.date = undefined

    const telegramLineItems = invoice.line_items.filter(
      (item: any) => !String(item?.description ?? "").includes("###")
    );

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
 * Persists edited line items on an existing (typically draft) invoice.
 * Zoho's PUT invoices/{id} replaces the entire line_items array, so callers
 * must always send the full current set of line items, not just the edited
 * ones. Deliberately has no Telegram/Redis side effects, unlike createInvoice's
 * update path — this is a quiet correction, not a re-send.
 */
export async function updateInvoiceLineItems(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    const { line_items } = req.body ?? {};
    if (!Array.isArray(line_items) || line_items.length === 0) {
      throw new Error("line_items (non-empty array) is required");
    }

    const zohoLineItems = line_items.map((item: any) => ({
      item_id: item.item_id,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      unit: item.unit,
    }));

    const invoice = await ZohoUpdateInvoice(access_token, id, { line_items: zohoLineItems });

    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update invoice line items",
    });
  }
}

/** Reassigns a draft invoice to a different customer, e.g. when it was created against the wrong contact. */
export async function updateInvoiceCustomer(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the invoice customer");
    if (!id) throw new Error("id not provided");

    const { customer_id } = req.body ?? {};
    if (!customer_id) throw new Error("customer_id not provided");

    await ZohoUpdateInvoice(access_token, id, { customer_id });
    const invoice = await ZohoGetInvoiceById(access_token, id);

    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update invoice customer",
    });
  }
}

export async function resendInvoiceTelegramMessage(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured resending the invoice");
    if (!id) throw new Error("id not provided");

    await ZohoUpdateInvoice(access_token, id, { date: date || todayInBusinessTimezone() });

    const invoice = await ZohoGetInvoiceById(access_token, id);

    if (!date) invoice.date = undefined
    
    const telegramLineItems = invoice.line_items.filter(
      (item: any) => !String(item?.description ?? "").includes("###")
    );

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

export async function payInvoiceBalance(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured recording payment");
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

export async function splitInvoice(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured splitting the invoice");
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
      const newDraftTelegramLineItems = newDraft.line_items.filter(
        (item: any) => !String(item?.description ?? "").includes("###")
      );
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

export async function markInvoiceAsSent(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured marking the invoice as sent");
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
