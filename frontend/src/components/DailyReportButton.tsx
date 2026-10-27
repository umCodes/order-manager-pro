import { useState } from "react";
import { CheckCircle2, FileBarChart, FileText, Loader2, Send, TriangleAlert } from "lucide-react";
import { dailyReportUrl, fetchDailyReportDays, sendDailyReport, type DailyReportDays } from "../lib/api";
import PdfFileButton from "./PdfFileButton";

/** "18 Oct" for a YYYY-MM-DD day. */
function shortDay(day: string) {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

type SendResult = { phone: string; ok: boolean; error?: string }[];

/**
 * The daily business report (Amharic PDF) for the last finished business
 * day, or the current one so far (business days run 4am to 4am): download
 * it, or send it on WhatsApp to the numbers set in Settings — after a
 * confirmation, since it goes straight to them.
 */
export default function DailyReportButton() {
  const [days, setDays] = useState<DailyReportDays | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDay, setConfirmDay] = useState<{ day: string; label: string } | null>(null);
  const [sent, setSent] = useState<{ label: string; results: SendResult } | null>(null);

  function open() {
    setIsOpen(true);
    setError(null);
    setSent(null);
    fetchDailyReportDays()
      .then(setDays)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load report days"));
  }

  function close() {
    setIsOpen(false);
    setConfirmDay(null);
  }

  function send(day: string, label: string) {
    if (busy) return;
    setBusy(`send-${day}`);
    setError(null);
    setSent(null);
    sendDailyReport(day)
      .then((results) => setSent({ label, results }))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to send the report"))
      .finally(() => {
        setBusy(null);
        setConfirmDay(null);
      });
  }

  const whatsapp = days?.whatsapp;
  const canSend = !!whatsapp?.template && whatsapp.recipients > 0;
  const choices = days
    ? [
        { day: days.previous, label: `Yesterday · ${shortDay(days.previous)}` },
        { day: days.today, label: `Today so far · ${shortDay(days.today)}` },
      ]
    : [];

  return (
    <>
      <button type="button" className="icon-btn" onClick={open} aria-label="Daily report" title="Daily report">
        <FileBarChart size={14} />
      </button>

      {isOpen && !confirmDay && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={busy ? undefined : close} />
          <div className="modal">
            <div className="modal__title">Daily Report</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              Payments, items sold, invoices, returns and undelivered orders for a business day (4am to 4am).
            </div>
            {!days && !error && <div className="items-area__empty">Loading…</div>}
            {choices.map(({ day, label }) => (
              <div key={day} className="daily-report-day">
                <div className="daily-report-day__title">{label}</div>
                <div className="daily-report-day__actions">
                  <PdfFileButton
                    url={dailyReportUrl(day)}
                    filename={`daily-report-${day}.pdf`}
                    label={`the daily report of ${day}`}
                    disabled={!!busy}
                    buttonText={
                      <>
                        <FileText size={15} /> PDF
                      </>
                    }
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!!busy || !canSend}
                    onClick={() => setConfirmDay({ day, label })}
                    title={canSend ? "Send on WhatsApp" : "Set the template and numbers in Settings first"}
                  >
                    {busy === `send-${day}` ? <Loader2 size={15} className="refresh-button__icon--spinning" /> : <Send size={15} />}
                    Send
                  </button>
                </div>
              </div>
            ))}
            {days && !canSend && (
              <div className="daily-report-hint">To send it on WhatsApp, choose the template and numbers in Settings → Daily report on WhatsApp.</div>
            )}
            {sent && (
              <div
                className={`notify-banner ${sent.results.every((r) => r.ok) ? "notify-banner--success" : "notify-banner--failed"}`}
                style={{ marginTop: 12 }}
              >
                {sent.results.every((r) => r.ok) ? (
                  <CheckCircle2 className="notify-banner__icon" size={14} />
                ) : (
                  <TriangleAlert className="notify-banner__icon" size={14} />
                )}
                <span>
                  {sent.label}:{" "}
                  {sent.results.map((r) => (r.ok ? `sent to +${r.phone}` : `+${r.phone} failed (${r.error})`)).join(" · ")}
                </span>
              </div>
            )}
            {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--secondary" disabled={!!busy} onClick={close}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isOpen && confirmDay && whatsapp && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={busy ? undefined : () => setConfirmDay(null)} />
          <div className="modal">
            <div className="modal__title">Send the daily report?</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              Send the report for {confirmDay.label} on WhatsApp to {whatsapp.recipients}{" "}
              {whatsapp.recipients === 1 ? "number" : "numbers"}, with the template "{whatsapp.template}"?
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--secondary" disabled={!!busy} onClick={() => setConfirmDay(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" disabled={!!busy} onClick={() => send(confirmDay.day, confirmDay.label)}>
                {busy ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
