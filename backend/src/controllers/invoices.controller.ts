import type { Request, Response } from "express";
import { ZohoCreateInvoice, ZohoGetDrafts, ZohoGetDraftToMergeInto, ZohoGetInvoiceById, ZohoUpdateInvoice, ZohoMarkInvoiceAsSent, recordInvoicePayment } from "../services/zoho/invoices.js";
import { sendInvoiceTelegramMessage, updateInvoiceDateTelegramMessage, replyWithAddedInvoiceItemsTelegramMessage } from "../services/telegram/invoices.js";
import { redisClient } from "../config/redis.js";

export async function createInvoice(req: Request, res: Response) {

  const access_token = req.headers["Authorization"]

  const { contact_id, line_items, date } = req.body ?? {};

  console.log(line_items)
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

    const draftToMergeInto = await ZohoGetDraftToMergeInto(access_token, String(contact_id));

    if (draftToMergeInto) {
      await ZohoUpdateInvoice(access_token, String(draftToMergeInto.invoice_id), {
        ...(date ? { date } : {}),
        line_items: zohoLineItems,
      });

      const invoice = await ZohoGetInvoiceById(access_token, String(draftToMergeInto.invoice_id));

      const allTelegramLineItems = invoice.line_items.filter(
        (item: any) => !String(item?.description ?? "").includes("###")
      );

      const existingMessageId = await redisClient.get(String(invoice.invoice_id));

      console.log("allTelegramLineItems: ", allTelegramLineItems)
      const telegramMessage = existingMessageId
        ? await replyWithAddedInvoiceItemsTelegramMessage(invoice, allTelegramLineItems, Number(existingMessageId))
        : await sendInvoiceTelegramMessage(invoice, allTelegramLineItems);

      console.log("Telegram Message")
      console.log("MessageId: ", existingMessageId)
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

export async function updateInvoiceDate(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the invoice");
    if (!id) throw new Error("id not provided");

    await ZohoUpdateInvoice(access_token, id, { date: date || new Date().toISOString().slice(0, 10) });
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

export async function resendInvoiceTelegramMessage(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;
  const date = req.body.date;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured resending the invoice");
    if (!id) throw new Error("id not provided");

    await ZohoUpdateInvoice(access_token, id, { date: date || new Date().toISOString().slice(0, 10)});

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

    const { amount, payment_mode } = req.body ?? {};
    if (!amount) throw new Error("Amount not provided");

    const payment = await recordInvoicePayment(access_token, id, amount, payment_mode);
    res.status(201).json({ payment });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to record payment",
    });
  }
}

export async function markInvoiceAsSent(req: Request, res: Response) {
  const access_token = req.headers["Authorization"];
  const id  = req.params.id as string;

  try {
    if (!access_token || access_token instanceof Array) throw new Error("A problem occured marking the invoice as sent");
    if (!id) throw new Error("id not provided");

    const invoice = await ZohoMarkInvoiceAsSent(access_token, id);
    res.status(200).json({ invoice });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to mark invoice as sent",
    });
  }
}
