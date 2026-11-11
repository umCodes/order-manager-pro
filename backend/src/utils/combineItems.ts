import type { LineItem, ZohoInvoice } from "../services/zoho/types.js";

export type ItemBreakdownEntry = {
  invoice_id: string | number;
  invoice_number: string;
  customer_name: string;
  /** The source invoice's scheduled (invoice) date, so the frontend can group items by day. */
  date: string;
  quantity: number;
  unit: string;
  /** The line's Zoho item and description, to tie it to the order's Telegram shortage reports. */
  item_id: string;
  description: string;
};

export type CombinedItem = {
  name: string;
  quantity: number;
  unit: string;
  description: string;
  /** The item's Zoho Inventory category, or null when it has none (or isn't in the catalog). */
  category: string | null;
  breakdown: ItemBreakdownEntry[];
};

/** What's needed from a catalog item to find a line item's category. */
type CategorizedItem = { item_id?: string | number; name?: string; category: string | null };

/**
 * Rolls every invoice's line items up into one list per item name
 * (case-insensitive), summing quantities and keeping a per-invoice
 * breakdown of where each part of the total came from. Each item gets its
 * category from the catalog, matched by item id, else by name. Sorted by name.
 */
export function combineItems(invoices: ZohoInvoice[], catalog: CategorizedItem[] = []): CombinedItem[] {

    const categoryById = new Map<string, string | null>();
    const categoryByName = new Map<string, string | null>();
    for (const entry of catalog) {
      if (entry.item_id != null) categoryById.set(String(entry.item_id), entry.category);
      if (entry.name) categoryByName.set(entry.name.toLowerCase(), entry.category);
    }
    const categoryOf = (item: LineItem) =>
      (item.item_id ? categoryById.get(String(item.item_id)) : undefined) ??
      categoryByName.get(item.name.toLowerCase()) ??
      null;

    // Flatten all line items from all invoices into a single array,
    // tagging each with which draft/customer it came from
    const allItems = invoices.flatMap(inv =>
        inv.line_items.map((item: LineItem) => ({
          name: item.name,
          item_id: String(item.item_id ?? ""),
          quantity: item.quantity,
          unit: item.unit,
          description: item.description,
          category: categoryOf(item),
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name,
          date: inv.date,
        }))
      );

    // Use a Map to combine items with the same name (case-insensitive)
    const combinedMap = new Map<string, CombinedItem>();

    // Add items to map
    allItems.forEach(item => {
      const key = item.name.toLowerCase();
      const breakdownEntry: ItemBreakdownEntry = {
        invoice_id: item.invoice_id,
        invoice_number: item.invoice_number,
        customer_name: item.customer_name,
        date: item.date,
        quantity: item.quantity,
        unit: item.unit,
        item_id: item.item_id,
        description: item.description,
      };

      // Combine qunatities under the same name (key in lowercase)
      if (combinedMap.has(key)) {
        const existing = combinedMap.get(key)!;
        existing.quantity += item.quantity;
        existing.breakdown.push(breakdownEntry);
        existing.category ??= item.category;
      } else {
        combinedMap.set(key, {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          description: item.description,
          category: item.category,
          breakdown: [breakdownEntry],
        });
      }
    });

    // Convert map to array and sort by name
    const mergedAndSorted = Array.from(combinedMap.values()).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    return mergedAndSorted;

}
