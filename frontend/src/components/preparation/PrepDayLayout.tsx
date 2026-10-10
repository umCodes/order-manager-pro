import { useMemo, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { dayLabel, ordersByDay, type PrepDay } from "../../lib/preparation";
import { describeScheduledDay } from "../../lib/scheduledDate";
import RefreshButton from "../RefreshButton";
import { StatusLegend } from "./LineBadge";
import type { PrepOrdersState } from "../../hooks/usePrepOrders";

type Props = {
  title: string;
  prep: PrepOrdersState;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** The selected day's content. */
  children: (day: PrepDay) => ReactNode;
};

/**
 * What the Prepare and Items tabs share: the title and refresh, loading /
 * error states, the day buttons (today's including anything overdue; only
 * days with orders get one), the day's order / item / prepared counts, the
 * icon legend and any save error.
 */
export default function PrepDayLayout({ title, prep, selectedDate, onSelectDate, children }: Props) {
  const days = useMemo(() => ordersByDay(prep.orders), [prep.orders]);
  // Today (the first day) until another is picked, or if the picked day has run out of orders.
  const day = days.find((d) => d.date === selectedDate) ?? days[0];
  const lines = day ? day.orders.flatMap((order) => order.line_items) : [];
  const preparedCount = lines.filter((line) => line.prepared !== null).length;

  return (
    <div className="prp-page">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        <div className="page-header__actions">
          <RefreshButton onRefresh={prep.loadOrders} />
        </div>
      </div>

      {prep.isLoading ? (
        <div className="prp-empty">
          <Loader2 size={22} className="refresh-button__icon--spinning" />
          Loading…
        </div>
      ) : prep.loadError ? (
        <div className="prp-empty">
          <div className="form-error">{prep.loadError}</div>
          <button type="button" className="prp-btn prp-btn--primary" onClick={() => prep.loadOrders()}>
            Retry
          </button>
        </div>
      ) : !day ? (
        <div className="prp-empty">No orders</div>
      ) : (
        <>
          <div className="prp-days" role="tablist" aria-label="Day">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={d === day}
                className={`prp-day${d === day ? " prp-day--active" : ""}`}
                onClick={() => onSelectDate(d.date)}
              >
                <span className="prp-day__label">{dayLabel(d.date)}</span>
                <span className="prp-day__date">{describeScheduledDay(d.date).shortDate}</span>
              </button>
            ))}
          </div>

          <p className="prp-progress-text">
            <strong>{day.orders.length}</strong> orders · <strong>{lines.length}</strong> items · {preparedCount} prepared
          </p>
          <StatusLegend />

          {prep.saveError && (
            <div className="prp-error" role="alert">
              {prep.saveError}
              <button type="button" className="prp-error__close" onClick={prep.clearSaveError}>
                OK
              </button>
            </div>
          )}

          {children(day)}
        </>
      )}
    </div>
  );
}
