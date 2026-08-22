import { Check, ChevronDown } from "lucide-react";
import type { DraftLineItemSummary } from "../types";

type Props = {
  item: DraftLineItemSummary;
  isChecked: boolean;
  isExpanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
};

/**
 * One row in the aggregated items list: a checkable summary line plus an
 * expandable breakdown of which draft invoices contribute to the total quantity.
 */
export default function ItemBreakdownRow({ item, isChecked, isExpanded, onToggleChecked, onToggleExpanded }: Props) {
  return (
    <div>
      <div
        className={`invoice-item-row${isChecked ? " invoice-item-row--selected" : ""}${isExpanded ? " invoice-item-row--has-breakdown-open" : ""}`}
        role="checkbox"
        aria-checked={isChecked}
        tabIndex={0}
        onClick={onToggleChecked}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleChecked();
          }
        }}
      >
        <span className={`checkbox${isChecked ? " checkbox--checked" : ""}`} aria-hidden="true">
          {isChecked && <Check size={12} strokeWidth={3} />}
        </span>
        <div className="invoice-item-row__main">
          <div className="line-item__name">{item.name}</div>
          {item.description && <div className="line-item__meta">{item.description}</div>}
        </div>
        <div className="item-quantity-stack">
          <span className="line-item__total item-quantity">
            {item.quantity} {item.unit}
          </span>
          <button
            type="button"
            className="item-breakdown-toggle"
            aria-label={isExpanded ? "Hide distribution" : "Show distribution"}
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
          >
            <ChevronDown size={16} className={isExpanded ? "item-breakdown-toggle__icon--open" : ""} />
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="item-breakdown">
          {item.breakdown.map((entry) => (
            <div key={entry.invoice_id} className="item-breakdown__row">
              <span className="item-breakdown__source">
                {entry.customer_name} · {entry.invoice_number}
              </span>
              <span className="item-breakdown__quantity">
                {entry.quantity} {entry.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
