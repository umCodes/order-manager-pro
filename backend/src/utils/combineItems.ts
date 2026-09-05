import type { LineItem, ZohoInvoice } from "../services/zoho/types.js";

export type ItemBreakdownEntry = {
  invoice_id: string | number;
  invoice_number: string;
  customer_name: string;
  quantity: number;
  unit: string;
};

export type CombinedItem = {
  name: string;
  quantity: number;
  unit: string;
  description: string;
  breakdown: ItemBreakdownEntry[];
};

/**
 * Rolls every invoice's line items up into one list per item name
 * (case-insensitive), summing quantities and keeping a per-invoice
 * breakdown of where each part of the total came from. Sorted by name.
 */
export function combineItems(invoices: ZohoInvoice[]): CombinedItem[] {

    // Flatten all line items from all invoices into a single array,
    // tagging each with which draft/customer it came from
    const allItems = invoices.flatMap(inv =>
        inv.line_items.map((item: LineItem) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          description: item.description,
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name,
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
        quantity: item.quantity,
        unit: item.unit,
      };

      // Combine qunatities under the same name (key in lowercase)
      if (combinedMap.has(key)) {
        const existing = combinedMap.get(key)!;
        existing.quantity += item.quantity;
        existing.breakdown.push(breakdownEntry);
      } else {
        combinedMap.set(key, {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          description: item.description,
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
