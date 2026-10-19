import { useState } from "react";
import { FileBarChart, Loader2 } from "lucide-react";
import { dailyReportUrl, fetchDailyReportDays } from "../lib/api";
import { downloadPdfUrl } from "../lib/downloadPdf";

/** "18 Oct" for a YYYY-MM-DD day. */
function shortDay(day: string) {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Downloads the daily business report (Amharic PDF) for the last finished
 * business day, or the current one so far. Business days run 4am to 4am.
 */
export default function DailyReportButton() {
  const [days, setDays] = useState<{ today: string; previous: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setIsOpen(true);
    setError(null);
    fetchDailyReportDays()
      .then(setDays)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load report days"));
  }

  function download(day: string) {
    if (downloading) return;
    setDownloading(day);
    setError(null);
    downloadPdfUrl(dailyReportUrl(day), `daily-report-${day}.pdf`)
      .then(() => setIsOpen(false))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to download the report"))
      .finally(() => setDownloading(null));
  }

  return (
    <>
      <button type="button" className="icon-btn" onClick={open} aria-label="Daily report" title="Daily report">
        <FileBarChart size={14} />
      </button>

      {isOpen && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={downloading ? undefined : () => setIsOpen(false)} />
          <div className="modal">
            <div className="modal__title">Daily Report</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              Payments, sales, invoices, returns and unsent drafts for a business day (4am to 4am).
            </div>
            {!days && !error && <div className="items-area__empty">Loading…</div>}
            {days && (
              <div className="daily-report-options">
                <button
                  type="button"
                  className="btn btn--primary btn--full"
                  disabled={!!downloading}
                  onClick={() => download(days.previous)}
                >
                  {downloading === days.previous ? <Loader2 size={15} className="refresh-button__icon--spinning" /> : null}
                  Yesterday · {shortDay(days.previous)}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--full"
                  disabled={!!downloading}
                  onClick={() => download(days.today)}
                >
                  {downloading === days.today ? <Loader2 size={15} className="refresh-button__icon--spinning" /> : null}
                  Today so far · {shortDay(days.today)}
                </button>
              </div>
            )}
            {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--secondary" disabled={!!downloading} onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
