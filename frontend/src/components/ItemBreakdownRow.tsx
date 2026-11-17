import { Check, ChevronDown, ChevronRight, Truck } from "lucide-react";
import type { DraftLineItemSummary, OrderShortageItem } from "../types";
import type { BreakdownLoading } from "../lib/shortages";
import ShortageBadge from "./ShortageBadge";

type Props = {
  item: DraftLineItemSummary;
  isChecked: boolean;
  isExpanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
  /** Each breakdown entry's shortage reported in the Telegram group, by index (see shortagesForBreakdown). */
  shortages?: (OrderShortageItem | undefined)[];
  /** Each breakdown entry's item on its draft's Telegram messages and what was loaded (see loadingsForBreakdown). */
  loadings?: (BreakdownLoading | undefined)[];
  /** Opens the loading choices for a breakdown entry. */
  onLoadingTap?: (index: number) => void;
  /** Marks every draft's share of this item complete (all of it loaded). */
  onAllComplete?: () => void;
};

/** An entry's loading state: complete, partial, missing, or not confirmed yet. */
function loadingState(entry: BreakdownLoading | undefined) {
  if (!entry?.loaded) return "pending";
  return entry.loaded.received >= entry.item.ordered ? "complete" : entry.loaded.received > 0 ? "partial" : "missing";
}

/**
 * One row in the aggregated items list: a checkable summary line plus an
 * expandable breakdown of which draft invoices contribute to the total quantity.
 */
export default function ItemBreakdownRow({
  item,
  isChecked,
  isExpanded,
  onToggleChecked,
  onToggleExpanded,
  shortages = [],
  loadings = [],
  onLoadingTap,
  onAllComplete,
}: Props) {
  // How many of the item's drafts were confirmed loaded (each draft once, however many lines it has the item on).
  const loadable = [...new Map(loadings.filter((entry): entry is BreakdownLoading => !!entry).map((entry) => [entry.invoice_id, entry])).values()];
  const loadedCount = loadable.filter((entry) => entry.loaded).length;
  const allComplete = loadable.length > 0 && loadable.every((entry) => entry.loaded && entry.loaded.received >= entry.item.ordered);
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
          {loadable.length > 0 && (
            <span className={`item-loading-progress${loadedCount === loadable.length ? " item-loading-progress--done" : ""}`}>
              <Truck size={12} /> {loadedCount}/{loadable.length}
            </span>
          )}
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
          {loadable.length > 0 && onAllComplete && (
            <button
              type="button"
              className={`item-breakdown__all${allComplete ? " item-breakdown__all--done" : ""}`}
              disabled={allComplete}
              onClick={onAllComplete}
            >
              <Check size={13} strokeWidth={3} />
              {allComplete ? "All complete" : `All complete · ${item.quantity} ${item.unit}`}
            </button>
          )}
          {item.breakdown.map((entry, index) => {
            const loading = loadings[index];
            const state = loadingState(loading);
            const content = (
              <>
                <span className="item-breakdown__source">
                  {loading && <span className={`item-loading-dot item-loading-dot--${state}`} aria-hidden="true">{state === "complete" && <Check size={10} strokeWidth={3.5} />}</span>}
                  {entry.isCarriedOver && (
                    <span className="draft-card__overdue-dot" aria-label="Past due" title="Past due — carried over from an earlier day" />
                  )}
                  {entry.customer_name} · {entry.invoice_number}
                  {loading?.pending && <span className="item-loading-unsent" title="Not sent to Telegram yet" aria-label="Not sent yet" />}
                </span>
                <span className="item-breakdown__quantity">
                  {shortages[index] && (
                    <>
                      <ShortageBadge short={shortages[index].short} ordered={shortages[index].ordered} unit={shortages[index].unit} />{" "}
                    </>
                  )}
                  {loading?.loaded && state !== "complete" && (
                    <span className={`item-loading-got item-loading-got--${state}`}>got {loading.loaded.received}</span>
                  )}
                  <span className={state === "complete" ? "item-loading-struck" : undefined}>
                    {entry.quantity} {entry.unit}
                  </span>
                  {loading && <ChevronRight size={14} className="item-breakdown__chevron" />}
                </span>
              </>
            );
            return loading && onLoadingTap ? (
              <button
                key={`${entry.invoice_id}:${index}`}
                type="button"
                className={`item-breakdown__row item-breakdown__row--tappable item-breakdown__row--${state}`}
                onClick={() => onLoadingTap(index)}
              >
                {content}
              </button>
            ) : (
              <div key={`${entry.invoice_id}:${index}`} className="item-breakdown__row">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
