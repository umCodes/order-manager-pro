import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { buildScheduleOptions } from "../lib/scheduledDate";
import DayPickerRow from "./DayPickerRow";
import type { ScheduledDate } from "../types";

/** Options are day-of-week labels relative to "now"; stale after local midnight. */
function isNearMidnight(date: Date): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 22 * 60 + 30 || minutes <= 30;
}

type Props = {
  value: ScheduledDate;
  onChange: (date: ScheduledDate) => void;
};

/**
 * Optional scheduled-date picker for a new invoice. Options are computed
 * relative to "now" and go stale after midnight, so this warns near
 * midnight and offers a manual refresh; it also clears the selection if a
 * refresh drops the previously chosen date from the option list.
 */
export default function SchedulePicker({ value, onChange }: Props) {
  const [options, setOptions] = useState(() => buildScheduleOptions());
  const [isNearMidnightNow, setIsNearMidnightNow] = useState(() => isNearMidnight(new Date()));

  useEffect(() => {
    const id = setInterval(() => setIsNearMidnightNow(isNearMidnight(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  function refresh() {
    const nextOptions = buildScheduleOptions();
    setOptions(nextOptions);
    setIsNearMidnightNow(isNearMidnight(new Date()));
    if (value && !nextOptions.some((o) => o.date === value)) {
      onChange(null);
    }
  }

  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label">Scheduled Day (optional)</label>
        <button
          type="button"
          className="icon-btn"
          onClick={refresh}
          aria-label="Refresh day options"
          title="Refresh day options"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {isNearMidnightNow && (
        <div className="day-warning">
          It's close to midnight — days shown may be stale, refresh before picking one.
        </div>
      )}
      <DayPickerRow
        options={options}
        selectedDate={value}
        onSelect={onChange}
        extraOption={{ label: "None", isActive: value === null, onClick: () => onChange(null) }}
      />
    </div>
  );
}
