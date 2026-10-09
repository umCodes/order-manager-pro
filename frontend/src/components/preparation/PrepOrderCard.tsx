import { CalendarClock, Check, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { formatAmount, isOverdue, itemLabel, orderStatus, type OrderStatus } from "../../lib/preparation";
import { describeScheduledDay } from "../../lib/scheduledDate";
import { LineBadge, StatusIcon } from "./LineBadge";
import type { PrepLineItem, PrepOrder } from "../../types";

const STATUS: Record<OrderStatus, { label: string; icon: "todo" | "full" | "short" | "none" }> = {
  todo: { label: "Not started", icon: "todo" },
  prepared: { label: "Prepared", icon: "full" },
  partial: { label: "Partial", icon: "short" },
  none: { label: "Not found", icon: "none" },
};

type Props = {
  order: PrepOrder;
  isCollapsed: boolean;
  isSaving: boolean;
  onToggleCollapsed: () => void;
  onEditLine: (line: PrepLineItem) => void;
  onConfirmAll: () => void;
  onUndoAll: () => void;
};

/**
 * One order to prepare. The invoice number is the main identifier, the
 * customer name sits under it; the header always shows the order's status
 * and folds the card open or closed (a fully prepared order folds itself).
 * Each line opens the amount sheet; "All prepared" and "Undo" act on the
 * whole order, and both ask first.
 */
export default function PrepOrderCard({ order, isCollapsed, isSaving, onToggleCollapsed, onEditLine, onConfirmAll, onUndoAll }: Props) {
  const status = orderStatus(order);
  const { label, icon } = STATUS[status];
  const openCount = order.line_items.filter((line) => line.prepared === null).length;
  const hasRecorded = order.line_items.some((line) => line.prepared !== null);

  return (
    <div className={`prp-card prp-card--${status}`}>
      <button type="button" className="prp-card__header" aria-expanded={!isCollapsed} onClick={onToggleCollapsed}>
        <div className="prp-card__ids">
          <div className="prp-card__invoice">{order.invoice_number}</div>
          <div className="prp-card__customer">
            {order.customer_name}
            {isOverdue(order) && (
              <span className="prp-card__late">
                <CalendarClock size={12} strokeWidth={2.5} /> {describeScheduledDay(order.date).shortDate}
              </span>
            )}
          </div>
        </div>
        <span className={`prp-status prp-status--${status}`}>
          <StatusIcon status={icon} size={icon === "todo" ? 11 : 14} />
          {label}
        </span>
        <ChevronDown size={20} className={`prp-card__chevron${isCollapsed ? "" : " prp-card__chevron--open"}`} aria-hidden="true" />
      </button>

      {!isCollapsed && (
        <>
          <div className="prp-lines">
            {order.line_items.map((line) => (
              <button key={line.line_item_id} type="button" className="prp-line" onClick={() => onEditLine(line)}>
                <span className="prp-line__ordered">{formatAmount(line.quantity, line.unit)}</span>
                <span className="prp-line__name">{itemLabel(line)}</span>
                <LineBadge line={line} />
                <ChevronRight size={18} className="prp-line__chevron" aria-hidden="true" />
              </button>
            ))}
          </div>

          {openCount > 0 && (
            <button type="button" className="prp-card__all" disabled={isSaving} onClick={onConfirmAll}>
              <Check size={20} strokeWidth={3} /> {hasRecorded ? `Rest prepared (${openCount})` : "All prepared"}
            </button>
          )}
          {hasRecorded && (
            <button type="button" className="prp-card__undo" disabled={isSaving} onClick={onUndoAll}>
              <RotateCcw size={14} strokeWidth={2.5} /> Undo
            </button>
          )}
        </>
      )}
    </div>
  );
}
