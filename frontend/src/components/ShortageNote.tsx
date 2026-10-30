import type { OrderShortageItem } from "../types";

const amount = (value: number, unit: OrderShortageItem["unit"]) => (unit === "pcs" ? `${value}` : `${value}kg`);

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * What the preparers reported for an item, kept short: red "Missing", amber
 * "Short 5kg · 10/15kg", or grey "OK now" once a report no longer leaves it
 * short (e.g. the order was lowered). Under it, every report line as typed,
 * who sent it and when (✎ when edited).
 */
export default function ShortageNote({ shortage, title }: { shortage: OrderShortageItem; title?: string }) {
  const { unit } = shortage;
  const tone = shortage.short === 0 ? "ok" : shortage.available === 0 ? "missing" : "partial";
  const summary =
    tone === "ok"
      ? "OK now"
      : tone === "missing"
        ? `Missing ${amount(shortage.ordered, unit)}`
        : `Short ${amount(shortage.short, unit)} · ${shortage.available}/${amount(shortage.ordered, unit)}`;

  return (
    <div className={`shortage-note shortage-note--${tone}`}>
      <span className="shortage-note__summary">
        {title && `${title}: `}
        {summary}
      </span>
      {shortage.reports.map((report) => (
        <span key={`${report.message_id}:${report.line}`} className="shortage-note__report">
          {report.line} · {report.from.name || "?"} {time(report.edited ? report.updated_at : report.sent_at)}
          {report.edited && " ✎"}
        </span>
      ))}
    </div>
  );
}
