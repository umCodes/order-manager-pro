import type { Request, Response } from "express";
import { requireAccessToken } from "../../utils/requireAccessToken.js";
import { deleteCache } from "../../utils/cache.js";
import {
  createInvoiceReturn,
  getInvoiceReturnSummary,
  parseReturnItems,
} from "../../services/returns/invoiceReturns.js";

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
