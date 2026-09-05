import type { Request, Response } from 'express';
import type { ZohoInvoice, LineItem } from '../services/zoho/types.js';
import { ZohoGetItems } from '../services/zoho/items.js';
import { ZohoGetInvoiceById, ZohoGetDrafts} from '../services/zoho/invoices/index.js'
import { getCache, setTTLCache } from '../utils/cache.js';
import { combineItems } from '../utils/combineItems.js';


/** Every draft invoice's line items, rolled up per item — the shopping list for the Items tab. */
export async function getAllLineItems(req: Request, res: Response) {
   // Ensure token is fresh
   const access_token = req.headers["Authorization"]
    try {
    if (!access_token || access_token instanceof Array) throw "A problem occured getting items"

    // Fetch all draft invoices
    const invoices = await ZohoGetDrafts(access_token);
    const invoicesPromises = invoices.map((inv: ZohoInvoice) => ZohoGetInvoiceById(access_token, String(inv.invoice_id)));
    const invoicesData = await Promise.all(invoicesPromises);

    const items = combineItems(invoicesData)
    res.status(200).json({ items });
    return
  } catch (error) {
    console.error("Error fetching invoice items:", error);
    res.status(500).json({ error: "Failed to fetch invoice items" });
  }
}




/** The Zoho item catalog, cached in memory for 12 hours. */
export async function getItems(req: Request, res: Response) {
  
  const access_token = req.headers["Authorization"]
  try {
    if (!access_token || access_token instanceof Array) throw "A problem occured getting items"
    const cachedItems = getCache("items")

    if(cachedItems){
        res.status(200).json({items: cachedItems})
        return
      }
    const items = await ZohoGetItems(access_token);
    setTTLCache("items", items, 60 * 60 * 12)
    res.status(200).json({items})
    return
  } catch (error) {
    res.status(500).json({
        error: error instanceof Error ? error.message : "Internal Server Error"
    })
    return
  }
  
}
