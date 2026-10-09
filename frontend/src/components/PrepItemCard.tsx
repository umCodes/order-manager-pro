import { Check, ChevronDown, ChevronRight, Users } from "lucide-react";
import {
  ALL_DONE_LABEL,
  expectedAmount,
  formatWeight,
  lineStatus,
  toKilos,
  type ItemLine,
  type LineStatus,
  type OrderStatus,
  type PrepItem,
} from "../lib/prep";
import { StatusIcon, StepBadge } from "./PrepStatusIcon";
import type { PrepStep } from "../types";

type Props = {
  item: PrepItem;
  step: PrepStep;
  isExpanded: boolean;
  isSaving: boolean;
  onToggleExpanded: () => void;
  onEditLine: (itemLine: ItemLine) => void;
  onCompleteRest: () => void;
};

/** The item's overall icon: a conflict anywhere wins, then waiting / not done, then how it all went. */
function itemStatus(statuses: LineStatus[], doneKilos: number): LineStatus {
  if (statuses.includes("conflict")) return "conflict";
  if (statuses.every((s) => s === "waiting")) return "waiting";
  if (statuses.some((s) => s === "todo" || s === "waiting")) return "todo";
  if (statuses.every((s) => s === "full")) return "full";
  return doneKilos > 0 ? "short" : "none";
}

/**
 * One item across the day's orders at one step, for picking: how much is
 * expected in total, how much is recorded, and — expanded — who it's for,
 * each line tappable to record a different amount.
 */
export default function PrepItemCard({ item, step, isExpanded, isSaving, onToggleExpanded, onEditLine, onCompleteRest }: Props) {
  const statuses = item.lines.map(({ line }) => lineStatus(line, step));
  const openCount = statuses.filter((s) => s === "todo").length;
  const progress = item.expectedKilos > 0 ? Math.min(1, item.doneKilos / item.expectedKilos) : 0;
  const status = itemStatus(statuses, item.doneKilos);
  const cardStatus: OrderStatus =
    status === "full" ? "done" : status === "none" ? "short" : status === "todo" ? (item.doneKilos > 0 ? "partial" : "todo") : status;
  const labels = ALL_DONE_LABEL[step];

  return (
    <div className={`prep-card prep-card--${cardStatus}`}>
      <button type="button" className="prep-item__summary" aria-expanded={isExpanded} onClick={onToggleExpanded}>
        <div className="prep-item__needed">{formatWeight(item.expectedKilos)}</div>
        <div className="prep-card__heading">
          <div className="prep-card__title">{item.label}</div>
          <div className={`prep-item__shipped prep-item__shipped--${cardStatus}`}>
            <StatusIcon status={status} size={status === "todo" || status === "waiting" ? 12 : 14} />
            {item.doneKilos > 0 && formatWeight(item.doneKilos)}
            <span className="prep-item__customers">
              <Users size={13} strokeWidth={2.5} /> {item.lines.length}
            </span>
          </div>
        </div>
        <ChevronDown size={18} className={`prep-item__chevron${isExpanded ? " prep-item__chevron--open" : ""}`} aria-hidden="true" />
      </button>
      <div className="prep-progress" aria-hidden="true">
        <div className={`prep-progress__bar prep-progress__bar--${cardStatus}`} style={{ width: `${progress * 100}%` }} />
      </div>

      {isExpanded && (
        <div className="prep-lines">
          {item.lines.map((itemLine, index) => {
            const isWaiting = statuses[index] === "waiting";
            const expected = expectedAmount(itemLine.line, step) ?? itemLine.line.quantity;
            return (
              <button
                key={`${itemLine.order.invoice_id}|${itemLine.line.line_item_id}`}
                type="button"
                className={`prep-line${isWaiting ? " prep-line--waiting" : ""}`}
                disabled={isWaiting}
                onClick={() => onEditLine(itemLine)}
              >
                <span className="prep-line__qty">{formatWeight(toKilos(expected, itemLine.line.unit))}</span>
                <span className="prep-line__name">
                  {itemLine.order.customer_name}
                  <span className="prep-line__meta">{itemLine.order.invoice_number}</span>
                </span>
                <StepBadge line={itemLine.line} step={step} />
                <ChevronRight size={18} className="prep-line__chevron" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {openCount > 0 && (isExpanded || item.lines.length === 1) && (
        <button type="button" className="prep-big-btn prep-big-btn--ship" disabled={isSaving} onClick={onCompleteRest}>
          <Check size={20} strokeWidth={3} />
          {openCount === item.lines.length ? labels.all : `${labels.rest} (${openCount})`}
        </button>
      )}
    </div>
  );
}
