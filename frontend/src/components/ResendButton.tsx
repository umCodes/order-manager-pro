import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import { resendInvoiceTelegramMessage } from "../lib/api";
import { buildScheduleOptions } from "../lib/scheduledDate";
import DayPickerRow from "./DayPickerRow";

/** Icon button that opens a day picker for re-sending an invoice's Telegram message under a new scheduled date. */
export default function ResendButton({
  invoiceId,
  currentDate,
  onResent,
}: {
  invoiceId: string;
  currentDate: string;
  onResent: (date: string) => void;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scheduleOptions = useMemo(() => buildScheduleOptions(), []);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPickerOpen]);

  function handleSend(date?: string) {
    setIsPickerOpen(false);
    setIsSending(true);
    resendInvoiceTelegramMessage(invoiceId, date)
      .then(() => onResent(date ?? ""))
      .catch(() => {})
      .finally(() => setIsSending(false));
  }

  return (
    <div className="resend-button-container" ref={containerRef}>
      <button
        type="button"
        className={`icon-btn resend-button${isPickerOpen ? " icon-btn--armed" : ""}`}
        onClick={() => !isSending && setIsPickerOpen((open) => !open)}
        disabled={isSending}
        aria-label="Resend to Telegram"
        title="Resend to Telegram"
      >
        {isPickerOpen ? <Check size={14} /> : <Send size={14} />}
      </button>
      {isPickerOpen && (
        <div className="resend-button-picker">
          <DayPickerRow
            options={scheduleOptions}
            selectedDate={currentDate}
            onSelect={handleSend}
            extraOption={{ label: "None", isActive: !currentDate, onClick: () => handleSend() }}
          />
        </div>
      )}
    </div>
  );
}
