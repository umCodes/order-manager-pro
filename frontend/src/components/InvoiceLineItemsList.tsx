import { MessageSquareOff, Trash2 } from "lucide-react";
import { currency } from "../lib/currency";
import type { InvoiceLineItem } from "../types";

type Props = {
  lineItems: InvoiceLineItem[];
  total: number;
  onRemove: (cartKey: string) => void;
  /** Called when the name/meta column of a line item is clicked, to open it in the items modal. */
  onSelect: (cartKey: string) => void;
};

/** Editable list of line items on a new (unsubmitted) invoice, with a running total. */
export default function InvoiceLineItemsList({ lineItems, total, onRemove, onSelect }: Props) {
  if (lineItems.length === 0) {
    return <div className="items-area__empty">No items added yet</div>;
  }

  // An item on several lines (general items) shows each line's description to tell them apart.
  const linesPerItem = new Map<string, number>();
  for (const li of lineItems) linesPerItem.set(li.item_id, (linesPerItem.get(li.item_id) ?? 0) + 1);

  return (
    <div className="line-items">
      <div className="line-items__header">Line items</div>
      {lineItems.map((li) => (
        <div
          key={li.cartKey}
          className={`line-item${li.fromDraftId ? " line-item--from-draft" : ""}`}
          title={li.fromDraftId ? "Carried over from this customer's existing draft" : undefined}
        >
          <button type="button" className="line-item__main" onClick={() => onSelect(li.cartKey)}>
            <div className="line-item__name">
              <span className="line-item__name-text">{li.name}</span>
              {li.fromDraftId && <span className="badge badge--draft-origin">Existing</span>}
              {li.excludeFromTelegram && (
                <span
                  className="item-row__mute-icon"
                  title="Excluded from Telegram"
                  aria-label="Excluded from Telegram"
                >
                  <MessageSquareOff size={13} />
                </span>
              )}
            </div>
            <div className="line-item__meta">
              {(linesPerItem.get(li.item_id) ?? 0) > 1 && li.description ? `${li.description} · ` : ""}
              {li.quantity} × {currency(li.rate)}
            </div>
          </button>
          <div className="line-item__right">
            <span className="line-item__total">{currency(li.rate * li.quantity)}</span>
            <button
              type="button"
              className="line-item__remove"
              onClick={() => onRemove(li.cartKey)}
              aria-label={`Remove ${li.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <div className="line-items__total-row">
        <span>Total</span>
        <span>{currency(total)}</span>
      </div>
    </div>
  );
}
