import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { formatWeight, lineKilos, type ItemLine, type PrepItem } from "../lib/prep";
import { ShippedBadge } from "./PrepOrderCard";

type Props = {
  item: PrepItem;
  isExpanded: boolean;
  isSaving: boolean;
  onToggleExpanded: () => void;
  onEditLine: (itemLine: ItemLine) => void;
  onShipAll: () => void;
};

/**
 * One item across the day's orders, for picking: how much is needed in
 * total, how much has gone out, and — expanded — who it's for, each line
 * tappable to record a different amount.
 */
export default function PrepItemCard({ item, isExpanded, isSaving, onToggleExpanded, onEditLine, onShipAll }: Props) {
  const remainingLines = item.lines.filter(({ line }) => line.shipped === null);
  const isFinished = remainingLines.length === 0;
  const isShort = isFinished && item.shippedKilos < item.neededKilos - 1e-9;
  const progress = item.neededKilos > 0 ? Math.min(1, item.shippedKilos / item.neededKilos) : 0;
  const status = !isFinished ? (item.shippedKilos > 0 ? "partial" : "todo") : isShort ? "short" : "done";

  return (
    <div className={`prep-card prep-card--${status}`}>
      <button type="button" className="prep-item__summary" aria-expanded={isExpanded} onClick={onToggleExpanded}>
        <div className="prep-item__needed">{formatWeight(item.neededKilos)}</div>
        <div className="prep-card__heading">
          <div className="prep-card__title">{item.label}</div>
          <div className={`prep-item__shipped prep-item__shipped--${status}`}>
            {isFinished && !isShort ? (
              <>
                <Check size={14} strokeWidth={3} /> ሙሉ ወጥቷል
              </>
            ) : status === "todo" ? (
              "ገና"
            ) : (
              `${formatWeight(item.shippedKilos)} ወጥቷል`
            )}
            <span className="prep-item__customers"> · {item.lines.length} ደንበኛ</span>
          </div>
        </div>
        <ChevronDown size={18} className={`prep-item__chevron${isExpanded ? " prep-item__chevron--open" : ""}`} aria-hidden="true" />
      </button>
      <div className="prep-progress" aria-hidden="true">
        <div className={`prep-progress__bar prep-progress__bar--${status}`} style={{ width: `${progress * 100}%` }} />
      </div>

      {isExpanded && (
        <div className="prep-lines">
          {item.lines.map((itemLine) => (
            <button
              key={`${itemLine.order.invoice_id}|${itemLine.line.line_item_id}`}
              type="button"
              className="prep-line"
              onClick={() => onEditLine(itemLine)}
            >
              <span className="prep-line__qty">{formatWeight(lineKilos(itemLine.line).needed)}</span>
              <span className="prep-line__name">
                {itemLine.order.customer_name}
                <span className="prep-line__meta">{itemLine.order.invoice_number}</span>
              </span>
              <ShippedBadge line={itemLine.line} />
              <ChevronRight size={18} className="prep-line__chevron" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {!isFinished && (isExpanded || item.lines.length === 1) && (
        <button type="button" className="prep-big-btn prep-big-btn--ship" disabled={isSaving} onClick={onShipAll}>
          <Check size={20} strokeWidth={3} />
          {remainingLines.length === item.lines.length
            ? `ሁሉም ${formatWeight(item.neededKilos)} ወጥቷል`
            : `የቀረው ወጥቷል (${remainingLines.length})`}
        </button>
      )}
    </div>
  );
}
