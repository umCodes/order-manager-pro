import type { Request, Response } from "express";
import type { LineItem, ZohoInvoice } from "../services/zoho/types.js";
import { ZohoGetDrafts, ZohoGetInvoiceById } from "../services/zoho/invoices/index.js";
import { getShipments, parseShipmentUpdates, saveShipments } from "../services/prep/shipments.js";
import { requireAccessToken } from "../utils/requireAccessToken.js";

/**
 * The preparers' worklist: every draft with its line items, each carrying
 * what was recorded as shipped so far (null when nothing is recorded yet).
 */
export async function getPrepOrders(req: Request, res: Response) {
  try {
    const access_token = requireAccessToken(req, "A problem occured loading the orders");
    const drafts: ZohoInvoice[] = await ZohoGetDrafts(access_token);
    const invoices: ZohoInvoice[] = await Promise.all(
      drafts.map((draft) => ZohoGetInvoiceById(access_token, String(draft.invoice_id))),
    );
    const shipments = await getShipments(invoices.map((invoice) => String(invoice.invoice_id)));

    const orders = invoices.map((invoice) => {
      const shipped = shipments[String(invoice.invoice_id)] ?? {};
      return {
        invoice_id: String(invoice.invoice_id),
        invoice_number: invoice.invoice_number,
        customer_id: String(invoice.customer_id),
        customer_name: invoice.customer_name,
        date: invoice.date,
        line_items: invoice.line_items.map((item: LineItem) => {
          const record = shipped[String(item.line_item_id)];
          return {
            line_item_id: String(item.line_item_id),
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            shipped: record ? record.quantity : null,
            shipped_at: record ? record.recorded_at : null,
          };
        }),
      };
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error loading prep orders:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load orders" });
  }
}

/**
 * Records what left the warehouse for some of a draft's lines.
 * Body: `{ lines: [{ line_item_id, quantity }] }` — quantity null clears a line.
 */
export async function savePrepShipments(req: Request, res: Response) {
  const invoiceId = req.params.id as string;
  try {
    if (!invoiceId) throw new Error("id not provided");
    const updates = parseShipmentUpdates(req.body?.lines);
    const records = await saveShipments(invoiceId, updates);
    const shipped = Object.fromEntries(Object.entries(records).map(([lineId, record]) => [lineId, record.quantity]));
    res.status(200).json({ invoice_id: invoiceId, shipped });
  } catch (error) {
    console.error("Error saving shipments:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to save shipments" });
  }
}
