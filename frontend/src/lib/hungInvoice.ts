import type { Cart, InvoiceMode, ScheduledDate } from "../types";

/**
 * An in-progress invoice put aside ("hung") on the Invoice tab so another
 * order can be taken, then resumed later exactly as it was. There's a single
 * slot, not a list. Kept in localStorage, so it survives a refresh or closing
 * the app, but stays on this device.
 */
export type HungInvoice = {
  cart: Cart;
  contactId: string;
  scheduledDate: ScheduledDate;
  mode: InvoiceMode;
  draftId: string | null;
  /** ms since epoch, when it was hung. */
  hungAt: number;
};

const HUNG_INVOICE_KEY = "hung-invoice:v1";

export function loadHungInvoice(): HungInvoice | null {
  try {
    const raw = localStorage.getItem(HUNG_INVOICE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || typeof value.cart !== "object" || value.cart === null) return null;
    return {
      cart: value.cart,
      contactId: typeof value.contactId === "string" ? value.contactId : "",
      scheduledDate: typeof value.scheduledDate === "string" ? value.scheduledDate : null,
      mode: value.mode === "update" ? "update" : "new",
      draftId: typeof value.draftId === "string" ? value.draftId : null,
      hungAt: typeof value.hungAt === "number" ? value.hungAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Saves `invoice` into the slot, or empties it when null. */
export function saveHungInvoice(invoice: HungInvoice | null) {
  try {
    if (invoice) localStorage.setItem(HUNG_INVOICE_KEY, JSON.stringify(invoice));
    else localStorage.removeItem(HUNG_INVOICE_KEY);
  } catch {
    // Storage unavailable (private mode, quota): the slot still works until the page reloads.
  }
}
