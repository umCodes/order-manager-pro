import { MessageSquareOff, Trash2 } from "lucide-react";
import { currency } from "../lib/currency";
import type { InvoiceLineItem } from "../types";

type Props = {
  lineItems: InvoiceLineItem[];
  total: number;
  onRemove: (itemId: string) => void;
  /** Called when the name/meta column of a line item is clicked, to open it in the items modal. */
  onSelect: (itemId: string) => void;
};

/** Editable list of line items on a new (unsubmitted) invoice, with a running total. */
export default function InvoiceLineItemsList({ lineItems, total, onRemove, onSelect }: Props) {
  if (lineItems.length === 0) {
    return <div className="items-area__empty">No items added yet</div>;
  }

  return (
    <div className="line-items">
      <div className="line-items__header">Line items</div>
      {lineItems.map((li) => (
        <div
          key={li.item_id}
          className={`line-item${li.fromDraftId ? " line-item--from-draft" : ""}`}
          title={li.fromDraftId ? "Carried over from this customer's existing draft" : undefined}
        >
          <button type="button" className="line-item__main" onClick={() => onSelect(li.item_id)}>
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
              {li.quantity} × {currency(li.rate)}
            </div>
          </button>
          <div className="line-item__right">
            <span className="line-item__total">{currency(li.rate * li.quantity)}</span>
            <button
              type="button"
              className="line-item__remove"
              onClick={() => onRemove(li.item_id)}
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
