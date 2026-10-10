import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { formatAmount, itemStatus, type ItemLine, type PrepItemGroup } from "../../lib/preparation";
import { LineBadge, StatusIcon } from "./LineBadge";

const CARD_STATUS = { todo: "todo", full: "prepared", short: "partial", none: "none" } as const;

type Props = {
  item: PrepItemGroup;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onEditLine: (itemLine: ItemLine) => void;
};

/**
 * One item across the day's orders, for picking: the total ordered and how
 * much has been prepared, and — opened — every order it's for, each one
 * tappable to record its amount, just as on the Prepare tab.
 */
export default function PrepItemCard({ item, isExpanded, onToggleExpanded, onEditLine }: Props) {
  const status = itemStatus(item);
  const startedButOpen = status === "todo" && item.prepared > 0;

  return (
    <div className={`prp-card prp-card--${startedButOpen ? "partial" : CARD_STATUS[status]}`}>
      <button type="button" className="prp-item__header" aria-expanded={isExpanded} onClick={onToggleExpanded}>
        <span className="prp-item__total">{formatAmount(item.ordered, item.unit)}</span>
        <span className="prp-item__info">
          <span className="prp-item__name">{item.label}</span>
          <span className="prp-item__orders">
            <Users size={13} strokeWidth={2.5} /> {item.lines.length}
          </span>
        </span>
        <span className={`prp-badge prp-badge--${status}`}>
          <StatusIcon status={status} size={status === "todo" ? 14 : 18} />
          {(status === "short" || startedButOpen) && formatAmount(item.prepared, item.unit)}
        </span>
        <ChevronDown size={20} className={`prp-card__chevron${isExpanded ? " prp-card__chevron--open" : ""}`} aria-hidden="true" />
      </button>

      {isExpanded && (
        <div className="prp-lines">
          {item.lines.map((itemLine) => (
            <button
              key={`${itemLine.order.invoice_id}|${itemLine.line.line_item_id}`}
              type="button"
              className="prp-line"
              onClick={() => onEditLine(itemLine)}
            >
              <span className="prp-line__ordered">{formatAmount(itemLine.line.quantity, itemLine.line.unit)}</span>
              <span className="prp-line__name">
                <span className="prp-item__invoice">{itemLine.order.invoice_number}</span>
                <span className="prp-item__customer">{itemLine.order.customer_name}</span>
              </span>
              <LineBadge line={itemLine.line} />
              <ChevronRight size={18} className="prp-line__chevron" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
