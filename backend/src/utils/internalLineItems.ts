/**
 * A line item whose description carries this marker is internal: it still
 * exists on the Zoho invoice, but it is kept off the Telegram message and
 * off the customer's PDF.
 */
export const INTERNAL_ITEM_MARKER = "###";

/** Drops internal lines from a list — for anything the customer or the channel sees. */
export function excludeInternalLineItems(items: any[]): any[] {
    return items.filter((item: any) => !String(item?.description ?? "").includes(INTERNAL_ITEM_MARKER));
}

/** Strips the marker out of descriptions before they're stored on the invoice in Zoho. */
export function stripInternalMarker(items: any[]): any[] {
    return items.map((item: any) => ({
        ...item,
        description: String(item?.description ?? "").replace(/###/g, ""),
    }));
}
