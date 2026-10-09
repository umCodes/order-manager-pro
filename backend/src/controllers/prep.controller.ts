import type { Request, Response } from "express";
import type { LineItem, ZohoInvoice } from "../services/zoho/types.js";
import { ZohoGetDrafts, ZohoGetInvoiceById } from "../services/zoho/invoices/index.js";
import { getLineRecords, isPrepStep, parseStepUpdates, saveStep, type LineRecords } from "../services/prep/shipments.js";
import { requireAccessToken } from "../utils/requireAccessToken.js";
import { excludeInternalLineItems } from "../utils/internalLineItems.js";

/** A line's three steps as plain numbers (null = not recorded yet). */
function stepQuantities(records: LineRecords | undefined) {
  return {
    prepared: records?.prepared?.quantity ?? null,
    sent: records?.sent?.quantity ?? null,
    received: records?.received?.quantity ?? null,
  };
}

/**
 * The preparers' and drivers' worklist: every draft with its line items,
 * each carrying how much was prepared, sent and received so far.
 * Internal lines ("###") are left out, as on the Telegram message.
 */
export async function getPrepOrders(req: Request, res: Response) {
  try {
    const access_token = requireAccessToken(req, "A problem occured loading the orders");
    const drafts: ZohoInvoice[] = await ZohoGetDrafts(access_token);
    const invoices: ZohoInvoice[] = await Promise.all(
      drafts.map((draft) => ZohoGetInvoiceById(access_token, String(draft.invoice_id))),
    );
    const records = await getLineRecords(invoices.map((invoice) => String(invoice.invoice_id)));

    const orders = invoices.map((invoice) => {
      const lineRecords = records[String(invoice.invoice_id)] ?? {};
      return {
        invoice_id: String(invoice.invoice_id),
        invoice_number: invoice.invoice_number,
        customer_id: String(invoice.customer_id),
        customer_name: invoice.customer_name,
        date: invoice.date,
        line_items: (excludeInternalLineItems(invoice.line_items) as LineItem[]).map((item) => ({
          line_item_id: String(item.line_item_id),
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          ...stepQuantities(lineRecords[String(item.line_item_id)]),
        })),
      };
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error loading prep orders:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load orders" });
  }
}

/**
 * Records one step (prepared / sent / received) for some of a draft's lines.
 * Body: `{ lines: [{ line_item_id, quantity }] }` — quantity null clears a line.
 * Returns every line's steps for that draft.
 */
export async function savePrepStep(req: Request, res: Response) {
  const invoiceId = req.params.id as string;
  const step = req.params.step;
  try {
    if (!invoiceId) throw new Error("id not provided");
    if (!isPrepStep(step)) throw new Error("step must be prepared, sent or received");
    const updates = parseStepUpdates(req.body?.lines);
    const records = await saveStep(invoiceId, step, updates);
    const lines = Object.fromEntries(Object.entries(records).map(([lineId, record]) => [lineId, stepQuantities(record)]));
    res.status(200).json({ invoice_id: invoiceId, lines });
  } catch (error) {
    console.error("Error saving prep step:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to save" });
  }
}
