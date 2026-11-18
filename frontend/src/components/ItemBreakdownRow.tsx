import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { DraftLineItemSummary } from "../types";
import type { BreakdownLoading } from "../lib/shortages";
import { convertUnit } from "../lib/backupLists";
import StockChips, { type StockChip } from "./StockChips";

type Props = {
  item: DraftLineItemSummary;
  isChecked: boolean;
  isExpanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
  /** Each breakdown entry's item on its order's Telegram messages and what was loaded (see loadingsForBreakdown). */
  loadings?: (BreakdownLoading | undefined)[];
  /** Whether the preparers have seen to an order (invoice or backup list): only then is its 📦 shown. */
  isSeen?: (orderId: string) => boolean;
  /** Opens the loading choices for a breakdown entry. */
  onLoadingTap?: (index: number) => void;
  /** Marks every source's share of this item complete (all of it loaded). */
  onAllComplete?: () => void;
};

/** An entry's loading state: complete, partial, missing, or not confirmed yet. */
function loadingState(entry: BreakdownLoading | undefined) {
  if (!entry?.loaded) return "pending";
  return entry.loaded.received >= entry.item.ordered ? "complete" : entry.loaded.received > 0 ? "partial" : "missing";
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One row in the aggregated items list: a checkable summary line plus an
 * expandable breakdown of where the total comes from (drafts, and on the All
 * tab backup lists too). Icon chips, no words: 📦 what the preparers
 * reported available and 🚚 what was loaded, on the item (added up) and on
 * each source; tap a source to confirm what was loaded of it.
 */
export default function ItemBreakdownRow({
  item,
  isChecked,
  isExpanded,
  onToggleChecked,
  onToggleExpanded,
  loadings = [],
  isSeen = () => false,
  onLoadingTap,
  onAllComplete,
}: Props) {
  // Each order once, however many lines it has the item on.
  const loadable = [...new Map(loadings.filter((entry): entry is BreakdownLoading => !!entry).map((entry) => [entry.invoice_id, entry])).values()];
  const allComplete = loadable.length > 0 && loadable.every((entry) => entry.loaded && entry.loaded.received >= entry.item.ordered);

  // The item's 📦 / 🚚 added up in its own unit (amounts that can't be converted are left out).
  const sum = (entries: BreakdownLoading[], amount: (entry: BreakdownLoading) => number) =>
    round(entries.reduce((total, entry) => total + (convertUnit(amount(entry), entry.item.unit, item.unit) ?? 0), 0));
  const seen = loadable.filter((entry) => isSeen(entry.invoice_id));
  const loaded = loadable.filter((entry) => entry.loaded);
  const itemChips: StockChip[] = [
    ...(seen.length ? [{ kind: "ready" as const, value: sum(seen, (e) => e.item.reported), of: sum(seen, (e) => e.item.ordered), unit: item.unit }] : []),
    ...(loaded.length ? [{ kind: "truck" as const, value: sum(loaded, (e) => e.loaded!.received), of: sum(loadable, (e) => e.item.ordered), unit: item.unit }] : []),
  ];

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
          <StockChips chips={itemChips} />
        </div>
        <div className="item-quantity-stack">
          <span className="line-item__total item-quantity">
            {round(item.quantity)} {item.unit}
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
              {allComplete ? "All complete" : `All complete · ${round(item.quantity)} ${item.unit}`}
            </button>
          )}
          {item.breakdown.map((entry, index) => {
            const loading = loadings[index];
            const state = loadingState(loading);
            const chips: StockChip[] = loading
              ? [
                  ...(isSeen(loading.invoice_id)
                    ? [{ kind: "ready" as const, value: loading.item.reported, of: loading.item.ordered, unit: loading.item.unit }]
                    : []),
                  ...(loading.loaded
                    ? [{ kind: "truck" as const, value: loading.loaded.received, of: loading.item.ordered, unit: loading.item.unit }]
                    : []),
                ]
              : [];
            const content = (
              <>
                <span className="item-breakdown__source item-breakdown__source--stacked">
                  <span>
                    {loading && (
                      <span className={`item-loading-dot item-loading-dot--${state}`} aria-hidden="true">
                        {state === "complete" && <Check size={10} strokeWidth={3.5} />}
                      </span>
                    )}
                    {entry.isCarriedOver && (
                      <span className="draft-card__overdue-dot" aria-label="Past due" title="Past due — carried over from an earlier day" />
                    )}
                    {entry.customer_name} · {entry.invoice_number}
                    {loading?.pending && <span className="item-loading-unsent" title="Not sent to Telegram yet" aria-label="Not sent yet" />}
                  </span>
                  <StockChips chips={chips} />
                </span>
                <span className="item-breakdown__quantity">
                  <span>
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
