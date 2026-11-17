import { useState } from "react";
import { FileText, UsersRound } from "lucide-react";
import { fetchPreparationReportPeople, preparationReportUrl, type PreparationReportPeople } from "../lib/api";
import PdfFileButton from "./PdfFileButton";

/** "18 Oct" for a YYYY-MM-DD day. */
function shortDay(day: string) {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The preparation report (Amharic PDF): who in the Telegram group prepared
 * which invoices and backup lists, for yesterday or today so far (business
 * days run 4am to 4am) — for everyone, or for one person.
 */
export default function PreparationReportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [data, setData] = useState<PreparationReportPeople | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(nextDay?: string) {
    setDay(nextDay ?? null);
    setError(null);
    fetchPreparationReportPeople(nextDay)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }

  const current = data?.day ?? day;
  const days = data ? [{ day: data.previous, label: `Yesterday · ${shortDay(data.previous)}` }, { day: data.today, label: `Today so far · ${shortDay(data.today)}` }] : [];
  const loadingDay = !data || data.day !== current;

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          setIsOpen(true);
          setData(null);
          load();
        }}
        aria-label="Preparation report"
        title="Preparation report"
      >
        <UsersRound size={14} />
      </button>

      {isOpen && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={() => setIsOpen(false)} />
          <div className="modal">
            <div className="modal__title">Preparation Report</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 12 }}>
              Who prepared which invoices in the Telegram group, for a business day (4am to 4am).
            </div>

            <div className="prep-report__days">
              {days.map((choice) => (
                <button
                  key={choice.day}
                  type="button"
                  className={`prep-report__day${choice.day === current ? " prep-report__day--active" : ""}`}
                  onClick={() => load(choice.day)}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            {!data && !error && <div className="items-area__empty">Loading…</div>}
            {data && current && (
              <>
                <div className="prep-report__row prep-report__row--all">
                  <div>
                    <div className="prep-report__name">Everyone</div>
                    <div className="prep-report__meta">Summary, problems to check, each person, and invoices nobody prepared</div>
                  </div>
                  <PdfFileButton
                    url={preparationReportUrl(current)}
                    filename={`preparation-report-${current}.pdf`}
                    label={`the preparation report of ${current}`}
                    buttonText={
                      <>
                        <FileText size={15} /> PDF
                      </>
                    }
                  />
                </div>
                <div className="prep-report__people-title">Per person</div>
                {loadingDay ? (
                  <div className="items-area__empty">Loading…</div>
                ) : data.people.length === 0 ? (
                  <div className="items-area__empty">Nobody prepared anything this day.</div>
                ) : (
                  data.people.map((person) => (
                    <div key={person.id} className="prep-report__row">
                      <div>
                        <div className="prep-report__name">{person.name}</div>
                        <div className="prep-report__meta">
                          {person.orders} prepared · {person.reports} shortage report{person.reports === 1 ? "" : "s"}
                          {!!person.problems && (
                            <span className="prep-report__problems">
                              {" "}
                              · {person.problems} problem{person.problems === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <PdfFileButton
                        url={preparationReportUrl(current, person.id)}
                        filename={`preparation-report-${current}-${person.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.pdf`}
                        label={`${person.name}'s preparation report of ${current}`}
                        buttonText={
                          <>
                            <FileText size={15} /> PDF
                          </>
                        }
                      />
                    </div>
                  ))
                )}
              </>
            )}
            {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--secondary" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
