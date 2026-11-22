import type { InvoiceTelegramState } from "../types";
import { scheduledSendDateTime, scheduledSendLabel } from "../lib/telegramSchedule";

/**
 * An invoice's Telegram message: amber "⏰ Scheduled · Thu 12:00 AM" while
 * it's held for a later day, grey "Sent" once it's posted. Nothing when it
 * was never posted.
 */
export default function TelegramStateBadge({ telegram }: { telegram: InvoiceTelegramState | undefined }) {
  if (!telegram) return null;
  if (telegram.state === "scheduled") {
    return (
      <span
        className="telegram-state-badge telegram-state-badge--scheduled"
        title={`Held: goes to Telegram on ${scheduledSendDateTime(telegram.due_at)}`}
      >
        ⏰ Scheduled · {scheduledSendLabel(telegram.due_at)}
      </span>
    );
  }
  return (
    <span
      className="telegram-state-badge telegram-state-badge--sent"
      title={telegram.sent_at ? `Sent to Telegram ${new Date(telegram.sent_at).toLocaleString()}` : "Sent to Telegram"}
    >
      Sent
    </span>
  );
}
