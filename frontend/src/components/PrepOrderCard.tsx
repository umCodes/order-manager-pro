import { Check, ChevronRight } from "lucide-react";
import { amharicDay, formatWeight, itemLabel, lineKilos, lineStatus, orderStatus, type OrderStatus } from "../lib/prep";
import { describeScheduledDay } from "../lib/scheduledDate";
import type { PrepLineItem, PrepOrder } from "../types";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  todo: "ገና",
  partial: "በሂደት ላይ",
  done: "ሙሉ ወጥቷል",
  short: "ጎድሏል",
};

/** What was recorded for one line, as a coloured badge: ገና, ✓, the short amount, or አልወጣም. */
export function ShippedBadge({ line }: { line: PrepLineItem }) {
  const status = lineStatus(line);
  if (status === "todo") return <span className="prep-badge prep-badge--todo">ገና</span>;
  if (status === "full") {
    return (
      <span className="prep-badge prep-badge--full" aria-label="ሙሉ ወጥቷል">
        <Check size={18} strokeWidth={3} />
      </span>
    );
  }
  if (status === "none") return <span className="prep-badge prep-badge--none">አልወጣም</span>;
  return <span className="prep-badge prep-badge--short">{formatWeight(lineKilos(line).shipped ?? 0)}</span>;
}

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
 */
export default function PrepOrderCard({ order, isSaving, onEditLine, onShipAll }: Props) {
  const status = orderStatus(order);
  const remaining = order.line_items.filter((line) => line.shipped === null).length;
  const isLate = describeScheduledDay(order.date).isPast;

  return (
    <div className={`prep-card prep-card--${status}`}>
      <div className="prep-card__header">
        <div className="prep-card__heading">
          <div className="prep-card__title">{order.customer_name}</div>
          <div className="prep-card__subtitle">{order.invoice_number}</div>
          {isLate && <div className="prep-card__late">የ{amharicDay(order.date).label} ትዕዛዝ</div>}
        </div>
        <span className={`prep-status prep-status--${status}`}>{ORDER_STATUS_LABEL[status]}</span>
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
          {remaining === order.line_items.length ? "ሁሉም ወጥቷል" : `የቀረው ወጥቷል (${remaining})`}
        </button>
      )}
    </div>
  );
}
