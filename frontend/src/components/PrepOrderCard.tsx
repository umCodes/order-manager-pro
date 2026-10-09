import { Check, ChevronRight } from "lucide-react";
import { describeScheduledDay } from "../lib/scheduledDate";
import { formatQuantity, lineStatus, orderStatus, type OrderStatus } from "../lib/prep";
import type { PrepLineItem, PrepOrder } from "../types";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  todo: "Not started",
  partial: "In progress",
  done: "All out",
  short: "Went out short",
};

/** What was recorded for one line, as a coloured badge: "—", "✓ 10", "9 of 10", "0 of 10". */
export function ShippedBadge({ line }: { line: PrepLineItem }) {
  const status = lineStatus(line);
  if (status === "todo") return <span className="prep-badge prep-badge--todo">Not yet</span>;
  if (status === "full") {
    return (
      <span className="prep-badge prep-badge--full">
        <Check size={14} strokeWidth={3} /> {formatQuantity(line.shipped ?? 0)}
      </span>
    );
  }
  return (
    <span className={`prep-badge prep-badge--${status}`}>
      {formatQuantity(line.shipped ?? 0)} of {formatQuantity(line.quantity)}
    </span>
  );
}

type Props = {
  order: PrepOrder;
  isSaving: boolean;
  onEditLine: (line: PrepLineItem) => void;
  onShipAll: () => void;
};

/**
 * One customer's order on the preparers' screen: each line is a big tap
 * target that opens the quantity sheet, and "All shipped" records every line
 * still not done as going out in full — so a normal order is a single tap.
 */
export default function PrepOrderCard({ order, isSaving, onEditLine, onShipAll }: Props) {
  const status = orderStatus(order);
  const remaining = order.line_items.filter((line) => line.shipped === null).length;
  const scheduled = describeScheduledDay(order.date);

  return (
    <div className={`prep-card prep-card--${status}`}>
      <div className="prep-card__header">
        <div className="prep-card__heading">
          <div className="prep-card__title">{order.customer_name}</div>
          <div className="prep-card__subtitle">
            {order.invoice_number} · {order.line_items.length} item{order.line_items.length === 1 ? "" : "s"}
          </div>
          {scheduled.isPast && <div className="prep-card__late">Was due {scheduled.label} {scheduled.shortDate}</div>}
        </div>
        <span className={`prep-status prep-status--${status}`}>{ORDER_STATUS_LABEL[status]}</span>
      </div>

      <div className="prep-lines">
        {order.line_items.map((line) => (
          <button key={line.line_item_id} type="button" className="prep-line" onClick={() => onEditLine(line)}>
            <span className="prep-line__name">
              {line.name}
              {line.description && <span className="prep-line__meta">{line.description}</span>}
            </span>
            <span className="prep-line__needed">
              {formatQuantity(line.quantity)} {line.unit}
            </span>
            <ShippedBadge line={line} />
            <ChevronRight size={18} className="prep-line__chevron" aria-hidden="true" />
          </button>
        ))}
      </div>

      {remaining > 0 && (
        <button type="button" className="prep-big-btn prep-big-btn--ship" disabled={isSaving} onClick={onShipAll}>
          <Check size={20} strokeWidth={3} />
          {remaining === order.line_items.length ? "All shipped" : `Rest shipped (${remaining})`}
        </button>
      )}
    </div>
  );
}
