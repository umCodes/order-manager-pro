import type { ReactNode } from "react";
import { describeScheduledDay } from "../lib/scheduledDate";

/**
 * Section heading for one scheduled day in a day-grouped list ("Today ·
 * 23-9-2026", "Tomorrow · …", weekday otherwise), with a count and, when
 * any entries were carried over from an earlier day, how many.
 */
export default function DayGroupHeader({
  date,
  count,
  noun,
  carriedOverCount = 0,
  actions,
}: {
  /** YYYY-MM-DD, or null for the "Unscheduled" group. */
  date: string | null;
  count: number;
  noun: string;
  carriedOverCount?: number;
  actions?: ReactNode;
}) {
  const day = date ? describeScheduledDay(date) : null;

  return (
    <div className="day-group__header">
      <div className="day-group__title">
        <span className="day-group__label">{day ? day.label : "Unscheduled"}</span>
        {day && <span className="day-group__date">{day.formattedDate}</span>}
      </div>
      <div className="day-group__meta">
        <span className="day-group__count">
          {count} {noun}
          {count === 1 ? "" : "s"}
          {carriedOverCount > 0 && (
            <span className="day-group__past-due" title="Scheduled for an earlier day but still unsent">
              {" · "}
              {carriedOverCount} past due
            </span>
          )}
        </span>
        {actions}
      </div>
    </div>
  );
}
