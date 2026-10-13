import type { Request, Response } from 'express';
import type { ZohoInvoice } from '../services/zoho/types.js';
import { getCatalogItems } from '../services/zoho/items.js';
import { ZohoGetInvoiceById, ZohoGetDrafts} from '../services/zoho/invoices/index.js'
import { combineItems } from '../utils/combineItems.js';


/**
 * Every draft invoice's line items, rolled up per item — the shopping list for
 * the Items tab. Each item carries its Zoho Inventory category so the tab can
 * group by it.
 */
export async function getAllLineItems(req: Request, res: Response) {
   // Ensure token is fresh
   const access_token = req.headers["Authorization"]
    try {
    if (!access_token || access_token instanceof Array) throw "A problem occured getting items"

    // Fetch all draft invoices
    const invoices = await ZohoGetDrafts(access_token);
    const invoicesPromises = invoices.map((inv: ZohoInvoice) => ZohoGetInvoiceById(access_token, String(inv.invoice_id)));
    const [invoicesData, catalog] = await Promise.all([
      Promise.all(invoicesPromises),
      // Categories are a nice-to-have: the list still loads without them.
      getCatalogItems(access_token).catch((error) => {
        console.error("Failed to load item categories:", error);
        return [];
      }),
    ]);

    const items = combineItems(invoicesData, catalog)
    res.status(200).json({ items });
    return
  } catch (error) {
    console.error("Error fetching invoice items:", error);
    res.status(500).json({ error: "Failed to fetch invoice items" });
  }
}




/** The item catalog (from Zoho Inventory, with each item's category), cached in memory for 12 hours. */
export async function getItems(req: Request, res: Response) {
  
  const access_token = req.headers["Authorization"]
  try {
    if (!access_token || access_token instanceof Array) throw "A problem occured getting items"
    const items = await getCatalogItems(access_token)
    res.status(200).json({items})
    return
  } catch (error) {
    res.status(500).json({
        error: error instanceof Error ? error.message : "Internal Server Error"
    })
    return
  }
  
}
