import { Check, ChevronDown } from "lucide-react";
import type { DraftLineItemSummary } from "../types";
import { convertUnit } from "../lib/backupLists";
import StockChips, { type StockChip } from "./StockChips";

type Props = {
  item: DraftLineItemSummary;
  isChecked: boolean;
  isExpanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
  /**
   * Each breakdown entry's 📦: what the preparers reported available of it
   * (in the entry's unit), or undefined while nobody has seen to its order.
   */
  reported?: (number | undefined)[];
};

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One row in the aggregated items list: a checkable summary line plus an
 * expandable breakdown of where the total comes from (drafts, and on the All
 * tab backup lists too). An icon chip, no words: 📦 what the preparers
 * reported available in the Telegram group, on the item (added up over the
 * sources they saw to) and on each source.
 */
export default function ItemBreakdownRow({ item, isChecked, isExpanded, onToggleChecked, onToggleExpanded, reported = [] }: Props) {
  const seen = item.breakdown.map((entry, index) => ({ entry, value: reported[index] })).filter(({ value }) => value !== undefined);
  const inItemUnit = (value: number, unit: string) => convertUnit(value, unit, item.unit) ?? 0;
  const itemChips: StockChip[] = seen.length
    ? [
        {
          kind: "ready",
          value: round(seen.reduce((sum, { entry, value }) => sum + inItemUnit(value!, entry.unit), 0)),
          of: round(seen.reduce((sum, { entry }) => sum + inItemUnit(entry.quantity, entry.unit), 0)),
          unit: item.unit,
        },
      ]
    : [];

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
          {item.breakdown.map((entry, index) => {
            const value = reported[index];
            return (
              <div key={`${entry.invoice_id}:${index}`} className="item-breakdown__row">
                <span className="item-breakdown__source item-breakdown__source--stacked">
                  <span>
                    {entry.isCarriedOver && (
                      <span className="draft-card__overdue-dot" aria-label="Past due" title="Past due — carried over from an earlier day" />
                    )}
                    {entry.customer_name} · {entry.invoice_number}
                  </span>
                  <StockChips chips={value === undefined ? [] : [{ kind: "ready", value, of: entry.quantity, unit: entry.unit }]} />
                </span>
                <span className="item-breakdown__quantity">
                  {entry.quantity} {entry.unit}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
