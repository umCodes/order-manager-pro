import type { Request, Response } from "express";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { deleteCache } from "../../utils/cache.js";
import {
  createInvoiceReturn,
  getInvoiceReturn,
  getInvoiceReturnSummary,
  listInvoiceReturns,
  parseReturnItems,
} from "../../services/returns/invoiceReturns.js";
import { ZohoGetCustomerById, getContactPreferredLanguage } from "../../services/zoho/customers/index.js";
import { createReturnNoticePdfBuffer, toReturnNoticePdfData } from "../../pdf/index.js";

const MAX_REASON_LENGTH = 500;

/** What can still be returned from an invoice (per item), and its returns so far. Shown as "Return Invoice" in the app. */
export async function getInvoiceReturns(req: Request, res: Response) {
  const id = req.params.id as string;
  try {
    const access_token = requireAccessToken(req, "A problem occured loading the invoice's returns");
    if (!id) throw new Error("id not provided");
    res.status(200).json(await getInvoiceReturnSummary(access_token, id));
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load returns" });
  }
}

/**
 * Creates a return (a Zoho credit note) for some of an invoice's items.
 * Body: `{ items: [{ item_id, quantity }], reason? }` — everything else
 * (customer, prices, taxes) comes from the invoice itself, and quantities are
 * checked against what's still returnable.
 */
export async function createInvoiceReturnHandler(req: Request, res: Response) {
  const id = req.params.id as string;
  try {
    const access_token = requireAccessToken(req, "A problem occured creating the return");
    if (!id) throw new Error("id not provided");
    const items = parseReturnItems(req.body?.items);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, MAX_REASON_LENGTH) : undefined;

    const created = await createInvoiceReturn(access_token, id, items, reason);
    // The customer's balance due changed (credit applied, or new account credit).
    deleteCache("customers");
    res.status(201).json(created);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create the return" });
  }
}

/**
 * A return's "Return Notice" PDF — the sales invoice layout, in the
 * customer's preferred language (Amharic adds an English page, like the
 * invoice). Inline by default; `?download=1` serves it as an attachment.
 */
export async function getInvoiceReturnPdf(req: Request, res: Response) {
  const id = req.params.id as string;
  const creditNoteId = req.params.creditnoteId as string;
  try {
    const access_token = requireAccessToken(req, "A problem occured getting the return notice");
    if (!id || !creditNoteId) throw new Error("id not provided");
    const { invoice, creditNote } = await getInvoiceReturn(access_token, id, creditNoteId);
    const language = invoice.customer_id
      ? getContactPreferredLanguage(await ZohoGetCustomerById(access_token, String(invoice.customer_id)))
      : "am";
    const pdf = await createReturnNoticePdfBuffer(toReturnNoticePdfData(creditNote, invoice), language);

    res.setHeader("Content-Type", "application/pdf");
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${creditNote.creditnote_number}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to generate the return notice" });
  }
}

/** The returns made from an invoice, for its page's "Returns" list (no Zoho calls when there are none). */
export async function getInvoiceReturnList(req: Request, res: Response) {
  const id = req.params.id as string;
  try {
    const access_token = requireAccessToken(req, "A problem occured loading the invoice's returns");
    if (!id) throw new Error("id not provided");
    res.status(200).json({ returns: await listInvoiceReturns(access_token, id) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load returns" });
  }
}
