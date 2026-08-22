import type { ScheduleOption } from "../lib/scheduledDate";

type Props = {
  options: ScheduleOption[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
  disabled?: boolean;
  /** Extra leading pill, e.g. "None" for optional-date pickers. */
  extraOption?: { label: string; onClick: () => void; isActive: boolean };
};

/** Row of day pills (Today, Tomorrow, Wed, ...) shared by every scheduled-date picker. */
export default function DayPickerRow({ options, selectedDate, onSelect, disabled, extraOption }: Props) {
  return (
    <div className="day-pill-row">
      {extraOption && (
        <button
          type="button"
          className={`pill${extraOption.isActive ? " pill--active" : ""}`}
          onClick={extraOption.onClick}
        >
          {extraOption.label}
        </button>
      )}
      {options.map(({ date, label }) => (
        <button
          key={date}
          type="button"
          className={`pill${selectedDate === date ? " pill--active" : ""}`}
          disabled={disabled}
          onClick={() => onSelect(date)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
