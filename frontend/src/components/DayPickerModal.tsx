import type { ScheduleOption } from "../lib/scheduledDate";
import DayPickerRow from "./DayPickerRow";

type Props = {
  title: string;
  options: ScheduleOption[];
  selectedDate: string | null;
  isSaving: boolean;
  error: string | null;
  onSelect: (date: string) => void;
  onClose: () => void;
};

/** Modal wrapper around DayPickerRow, used to change an existing invoice's scheduled date. */
export default function DayPickerModal({ title, options, selectedDate, isSaving, error, onSelect, onClose }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal__title">{title}</div>
        <DayPickerRow options={options} selectedDate={selectedDate} onSelect={onSelect} disabled={isSaving} />
        {error && <div className="form-error">{error}</div>}
      </div>
    </div>
  );
}
