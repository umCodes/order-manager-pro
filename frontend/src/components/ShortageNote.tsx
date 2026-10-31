import type { OrderShortageItem } from "../types";
import { reportTime } from "../lib/shortages";

const amount = (value: number, unit: string) => `${value} ${unit}`.trim();

/**
 * An item the preparers reported short, kept short: red "Missing 5 kg" or
 * amber "Short 0.5 box · 1.5/2 box" (in the item's own unit), then who
 * reported it and when. Nothing for an item that isn't short.
 */
export default function ShortageNote({ shortage, title }: { shortage: OrderShortageItem; title?: string }) {
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
      {reporters.map((report) => (
        <span key={report.message_id} className="shortage-note__report">
          {report.from.name || "?"} {reportTime(report.edited ? report.updated_at : report.sent_at)}
        </span>
      ))}
    </div>
  );
}
