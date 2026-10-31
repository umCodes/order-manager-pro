import type { OrderShortageItem } from "../types";
import { reportTime } from "../lib/shortages";

const amount = (value: number, unit: OrderShortageItem["unit"]) => (unit === "pcs" ? `${value}` : `${value}kg`);

/**
 * An item the preparers reported short, kept short: red "Missing 5kg" or
 * amber "Short 5kg · 10/15kg", then who reported it and when. Nothing for an
 * item that isn't short.
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
