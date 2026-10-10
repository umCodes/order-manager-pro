import { formatAmount, itemStatus, itemsForDay } from "../lib/preparation";
import PrepDayLayout from "../components/preparation/PrepDayLayout";
import { StatusIcon } from "../components/preparation/LineBadge";
import type { PrepOrdersState } from "../hooks/usePrepOrders";

type Props = {
  prep: PrepOrdersState;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

/**
 * The Items tab: the selected day's total of each item across all its
 * orders — what has to go out that day — weighed items first, biggest
 * first. Read-only: amounts are recorded per order on the Prepare tab; the
 * icon shows how much of the total has been prepared so far.
 */
export default function PrepItemsPage({ prep, selectedDate, onSelectDate }: Props) {
  return (
    <PrepDayLayout title="Items" prep={prep} selectedDate={selectedDate} onSelectDate={onSelectDate}>
      {(day) => (
        <div className="prp-card prp-totals">
          {itemsForDay(day.orders).map((item) => {
            const status = itemStatus(item);
            const showPrepared = status === "short" || (status === "todo" && item.prepared > 0);
            return (
              <div key={`${item.label}|${item.unit}`} className="prp-totals__row">
                <span className="prp-totals__amount">{formatAmount(item.ordered, item.unit)}</span>
                <span className="prp-totals__name">{item.label}</span>
                <span className={`prp-badge prp-badge--${status}`}>
                  <StatusIcon status={status} size={status === "todo" ? 14 : 18} />
                  {showPrepared && formatAmount(item.prepared, item.unit)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PrepDayLayout>
  );
}
