import { Check, ChevronDown } from "lucide-react";
import type { DraftLineItemSummary, OrderShortageItem } from "../types";
import ShortageBadge from "./ShortageBadge";

type Props = {
  item: DraftLineItemSummary;
  isChecked: boolean;
  isExpanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
  /** Each breakdown entry's shortage reported in the Telegram group, by index (see shortagesForBreakdown). */
  shortages?: (OrderShortageItem | undefined)[];
};

/**
 * One row in the aggregated items list: a checkable summary line plus an
 * expandable breakdown of which draft invoices contribute to the total quantity.
 */
export default function ItemBreakdownRow({ item, isChecked, isExpanded, onToggleChecked, onToggleExpanded, shortages = [] }: Props) {
  // The item's total short across drafts, in its own unit — mixed units aren't added up.
  const short = shortages.filter((entry): entry is OrderShortageItem => !!entry);
  const totalUnit = short.length > 0 && short.every((entry) => entry.unit === short[0].unit) ? short[0].unit : null;
  const total = totalUnit
    ? { short: short.reduce((sum, entry) => sum + entry.short, 0), ordered: short.reduce((sum, entry) => sum + entry.ordered, 0) }
    : null;

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
          {total && totalUnit && <ShortageBadge short={total.short} ordered={total.ordered} unit={totalUnit} />}
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
          {item.breakdown.map((entry, index) => (
            <div key={`${entry.invoice_id}:${index}`} className="item-breakdown__row">
              <span className="item-breakdown__source">
                {entry.isCarriedOver && (
                  <span className="draft-card__overdue-dot" aria-label="Past due" title="Past due — carried over from an earlier day" />
                )}
                {entry.customer_name} · {entry.invoice_number}
              </span>
              <span className="item-breakdown__quantity">
                {shortages[index] && (
                  <>
                    <ShortageBadge short={shortages[index].short} ordered={shortages[index].ordered} unit={shortages[index].unit} />{" "}
                  </>
                )}
                {entry.quantity} {entry.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
