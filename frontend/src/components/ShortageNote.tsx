import type { OrderShortageItem } from "../types";

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * What the preparers reported for an item: red when none is available,
 * amber when only part is, grey once a report no longer leaves it short
 * (e.g. the order was lowered). Lists every report line behind it.
 */
export default function ShortageNote({ shortage, title }: { shortage: OrderShortageItem; title?: string }) {
  const tone = shortage.short === 0 ? "ok" : shortage.available === 0 ? "missing" : "partial";
  const summary =
    tone === "ok"
      ? `Reported, but nothing is short now (${shortage.ordered} ${shortage.unit} needed)`
      : tone === "missing"
        ? `Missing: none of the ${shortage.ordered} ${shortage.unit} available`
        : `Short ${shortage.short} ${shortage.unit}: ${shortage.available} of ${shortage.ordered} ${shortage.unit} available`;

  return (
    <div className={`shortage-note shortage-note--${tone}`}>
      <div className="shortage-note__summary">
        {title && <strong>{title} · </strong>}
        {summary}
      </div>
      {shortage.reports.map((report) => (
        <div key={`${report.message_id}:${report.line}`} className="shortage-note__report">
          “{report.line}” · {report.missing ? "missing" : `${report.available} of ${report.ordered}`} · {report.from.name || "someone"} ·{" "}
          {time(report.edited ? report.updated_at : report.sent_at)}
          {report.edited && " (edited)"}
        </div>
      ))}
    </div>
  );
}
