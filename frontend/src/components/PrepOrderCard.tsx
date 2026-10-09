import { CalendarClock, Check, ChevronRight } from "lucide-react";
import { amharicDay, formatWeight, itemLabel, lineKilos, orderStatus } from "../lib/prep";
import { describeScheduledDay } from "../lib/scheduledDate";
import { ShippedBadge, StatusIcon } from "./PrepStatusIcon";
import type { PrepLineItem, PrepOrder } from "../types";

type Props = {
  order: PrepOrder;
  isSaving: boolean;
  onEditLine: (line: PrepLineItem) => void;
  onShipAll: () => void;
};

/**
 * One customer's order on the preparers' screen: each line is a big tap
 * target that opens the quantity sheet, and the green button records every
 * line still not done as going out in full — so a normal order is one tap.
 * Status is shown with icons and counts, not words (see StatusLegend).
 */
export default function PrepOrderCard({ order, isSaving, onEditLine, onShipAll }: Props) {
  const status = orderStatus(order);
  const total = order.line_items.length;
  const remaining = order.line_items.filter((line) => line.shipped === null).length;
  const isLate = describeScheduledDay(order.date).isPast;

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
          {total - remaining}/{total}
        </span>
      </div>

      <div className="prep-lines">
        {order.line_items.map((line) => (
          <button key={line.line_item_id} type="button" className="prep-line" onClick={() => onEditLine(line)}>
            <span className="prep-line__qty">{formatWeight(lineKilos(line).needed)}</span>
            <span className="prep-line__name">{itemLabel(line)}</span>
            <ShippedBadge line={line} />
            <ChevronRight size={18} className="prep-line__chevron" aria-hidden="true" />
          </button>
        ))}
      </div>

      {remaining > 0 && (
        <button type="button" className="prep-big-btn prep-big-btn--ship" disabled={isSaving} onClick={onShipAll}>
          <Check size={20} strokeWidth={3} />
          {remaining === total ? "All out" : `Rest out (${remaining})`}
        </button>
      )}
    </div>
  );
}
