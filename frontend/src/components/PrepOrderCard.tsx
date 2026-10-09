import { CalendarClock, Check, ChevronRight } from "lucide-react";
import {
  ALL_DONE_LABEL,
  amharicDay,
  expectedAmount,
  formatWeight,
  itemLabel,
  lineStatus,
  openLines,
  orderStatus,
  recordedCount,
  toKilos,
} from "../lib/prep";
import { describeScheduledDay } from "../lib/scheduledDate";
import { StatusIcon, StepBadge } from "./PrepStatusIcon";
import type { PrepLineItem, PrepOrder, PrepStep } from "../types";

type Props = {
  order: PrepOrder;
  step: PrepStep;
  isSaving: boolean;
  onEditLine: (line: PrepLineItem) => void;
  onCompleteRest: () => void;
};

/**
 * One customer's order at one step: each line shows what's expected at this
 * step (ordered → prepared → sent) and a status icon, and opens the quantity
 * sheet on tap. The green button records every open line as matching what
 * was expected, so a normal order is one tap. Lines still waiting on the
 * step before are shown but can't be recorded yet.
 */
export default function PrepOrderCard({ order, step, isSaving, onEditLine, onCompleteRest }: Props) {
  const status = orderStatus(order, step);
  const total = order.line_items.length;
  const open = openLines(order, step).length;
  const isLate = describeScheduledDay(order.date).isPast;
  const labels = ALL_DONE_LABEL[step];

  return (
    <div className={`prep-card prep-card--${status}`}>
      <div className="prep-card__header">
        <div className="prep-card__heading">
          <div className="prep-card__title">{order.customer_name}</div>
          <div className="prep-card__subtitle">
            {order.invoice_number}
            {isLate && (
              <span className="prep-card__late">
                <CalendarClock size={13} strokeWidth={2.5} /> {amharicDay(order.date).label}
              </span>
            )}
          </div>
        </div>
        <span className={`prep-status prep-status--${status}`}>
          {status === "done" && <StatusIcon status="full" size={14} />}
          {status === "short" && <StatusIcon status="short" size={14} />}
          {status === "conflict" && <StatusIcon status="conflict" size={14} />}
          {recordedCount(order, step)}/{total}
        </span>
      </div>

      <div className="prep-lines">
        {order.line_items.map((line) => {
          const isWaiting = lineStatus(line, step) === "waiting";
          const expected = expectedAmount(line, step) ?? line.quantity;
          return (
            <button
              key={line.line_item_id}
              type="button"
              className={`prep-line${isWaiting ? " prep-line--waiting" : ""}`}
              disabled={isWaiting}
              onClick={() => onEditLine(line)}
            >
              <span className="prep-line__qty">{formatWeight(toKilos(expected, line.unit))}</span>
              <span className="prep-line__name">{itemLabel(line)}</span>
              <StepBadge line={line} step={step} />
              <ChevronRight size={18} className="prep-line__chevron" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {open > 0 && (
        <button type="button" className="prep-big-btn prep-big-btn--ship" disabled={isSaving} onClick={onCompleteRest}>
          <Check size={20} strokeWidth={3} />
          {open === total ? labels.all : `${labels.rest} (${open})`}
        </button>
      )}
    </div>
  );
}
