import type { PreparationConfirmation, PreparationStatus } from "../types";
import { reportTime } from "../lib/shortages";

const LABELS: Record<PreparationStatus, string> = {
  ready: "Ready",
  partial: "Partial",
  missing: "Missing",
  not_reported: "Not reported",
};

/**
 * An order's preparation in the Telegram group: green "Ready" (nothing
 * short), amber "Partial" (some items short), red "Missing" (every item
 * missing), grey "Not reported" (not seen to yet). With `confirmed`, who saw
 * to it and when.
 */
export default function PreparationBadge({
  status,
  confirmed,
}: {
  status: PreparationStatus;
  confirmed?: PreparationConfirmation | null;
}) {
  return (
    <span className={`preparation-badge preparation-badge--${status}`}>
      {LABELS[status]}
      {confirmed && (
        <span className="preparation-badge__by">
          {confirmed.name || "?"} {reportTime(confirmed.at)}
        </span>
      )}
    </span>
  );
}
