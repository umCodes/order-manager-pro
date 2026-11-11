import type { OrderShortageItem } from "../types";
import { reportTime } from "../lib/shortages";

const amount = (value: number, unit: string) => `${value} ${unit}`.trim();

/**
 * An item the preparers reported short, kept short: red "Missing 5 kg" or
 * amber "Short 0.5 box · 1.5/2 box" (in the item's own unit), then who
 * reported it and when. Nothing for an item that isn't short.
 */
export default function ShortageNote({
  shortage,
  title,
  onApply,
  applyDisabledReason,
}: {
  shortage: OrderShortageItem;
  title?: string;
  /** Offers to set the invoice to the reported amount ("Use 1.5 box", or "Remove" when missing). */
  onApply?: () => void;
  /** Why applying isn't possible right now (shown on the disabled button). */
  applyDisabledReason?: string;
}) {
  if (shortage.short === 0) return null;
  const { unit } = shortage;
  const missing = shortage.available === 0;
  const reporters = [...new Map(shortage.reports.map((report) => [report.from.name, report])).values()];

  return (
    <div className={`shortage-note shortage-note--${missing ? "missing" : "partial"}`}>
      <span className="shortage-note__summary">
        {title && `${title}: `}
        {missing ? `Missing ${amount(shortage.ordered, unit)}` : `Short ${amount(shortage.short, unit)} · ${shortage.available}/${amount(shortage.ordered, unit)}`}
      </span>
      {onApply && (
        <button
          type="button"
          className="shortage-note__apply"
          disabled={!!applyDisabledReason}
          title={applyDisabledReason ?? "Change the invoice to the reported amount"}
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
        >
          {missing ? "Remove" : `Use ${amount(shortage.available, unit)}`}
        </button>
      )}
      {reporters.map((report) => (
        <span key={report.message_id} className="shortage-note__report">
          {report.from.name || "?"} {reportTime(report.edited ? report.updated_at : report.sent_at)}
        </span>
      ))}
    </div>
  );
}
