import { useState } from "react";
import { CalendarCheck, CalendarPlus, CheckCircle2, Loader2, MapPin, TriangleAlert } from "lucide-react";
import DayPickerRow from "./DayPickerRow";
import { buildScheduleOptions } from "../lib/scheduledDate";
import { businessDayDate } from "../lib/businessTime";
import { cancelVisit, completeVisit, scheduleVisit, useVisits, visitDayLabel } from "../lib/visits";
import { saveCustomerLocation, type DoneVisit } from "../lib/api";

type Props = {
  customerId: string;
  customerName: string;
  /** Smaller button, for tight spots like the invoice page. */
  compact?: boolean;
};

type Step =
  | { kind: "closed" }
  | { kind: "edit" }
  | { kind: "locating" }
  | { kind: "noLocation"; reason: string }
  | { kind: "result"; visit: DoneVisit; canSaveLocation: boolean; position?: { lat: number; lng: number } }
  | { kind: "confirmCancel" };

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This phone or browser can't share its location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
  });
}

function positionError(error: unknown) {
  if (typeof GeolocationPositionError !== "undefined" && error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) return "Location access was not allowed";
    if (error.code === error.TIMEOUT) return "The phone took too long to find its location";
    return "The phone couldn't find its location";
  }
  return error instanceof Error ? error.message : "The phone couldn't find its location";
}

function distanceLabel(metres: number) {
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** What the result of marking a visit done says. */
function resultMessage(visit: DoneVisit): { ok: boolean; text: string } {
  switch (visit.confirmation) {
    case "at_location":
      return { ok: true, text: `Visited — at the customer's location${visit.distance_m !== undefined ? ` (${distanceLabel(visit.distance_m)} away)` : ""}.` };
    case "away_from_location":
      return { ok: false, text: `Marked visited ${distanceLabel(visit.distance_m ?? 0)} away from the customer's location.` };
    case "no_customer_location":
      return { ok: true, text: "Visited. The customer has no map location to compare with, so this phone's location was saved with the visit." };
    case "location_not_checked":
      return { ok: false, text: "Marked visited without checking the location." };
    default:
      return { ok: true, text: "Visit done." };
  }
}

/**
 * A customer's visit: "Schedule visit" when there's none, or the visit's day
 * (red when overdue). Opens a window to pick or change the day — the usual
 * day buttons, or any later date — mark the visit done (the phone shares its
 * location once, compared with the customer's map location), or cancel it.
 */
export default function VisitButton({ customerId, customerName, compact }: Props) {
  const visits = useVisits();
  const visit = visits.byCustomer[customerId];
  const today = visits.today;
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [day, setDay] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationSaved, setLocationSaved] = useState(false);

  const options = buildScheduleOptions(businessDayDate());
  const isOverdue = !!visit && visit.day < today;

  function open() {
    setDay(visit?.day ?? null);
    setError(null);
    setStep({ kind: "edit" });
  }

  function close() {
    if (isSaving) return;
    setStep({ kind: "closed" });
  }

  function save() {
    if (!day) return;
    setIsSaving(true);
    setError(null);
    scheduleVisit(customerId, customerName, day)
      .then(() => setStep({ kind: "closed" }))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to schedule the visit"))
      .finally(() => setIsSaving(false));
  }

  function finish(confirmation: Parameters<typeof completeVisit>[1], position?: { lat: number; lng: number }) {
    setIsSaving(true);
    setError(null);
    completeVisit(customerId, confirmation)
      .then((result) => {
        setLocationSaved(false);
        setStep({ kind: "result", visit: result.visit, canSaveLocation: result.can_save_location, ...(position ? { position } : {}) });
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to mark the visit as done");
        setStep({ kind: "edit" });
      })
      .finally(() => setIsSaving(false));
  }

  function markVisited() {
    setError(null);
    setStep({ kind: "locating" });
    getPosition()
      .then((p) => {
        const position = { lat: p.coords.latitude, lng: p.coords.longitude };
        finish({ method: "location", position: { ...position, accuracy: p.coords.accuracy } }, position);
      })
      .catch((e) => setStep({ kind: "noLocation", reason: positionError(e) }));
  }

  function cancel() {
    setIsSaving(true);
    setError(null);
    cancelVisit(customerId)
      .then(() => setStep({ kind: "closed" }))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to cancel the visit");
        setStep({ kind: "edit" });
      })
      .finally(() => setIsSaving(false));
  }

  function saveLocation(position: { lat: number; lng: number }) {
    setIsSaving(true);
    setError(null);
    saveCustomerLocation(customerId, position)
      .then(() => setLocationSaved(true))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save the location"))
      .finally(() => setIsSaving(false));
  }

  const otherDate = day && !options.some((o) => o.date === day) ? day : "";

  return (
    <>
      <button
        type="button"
        className={`visit-button${compact ? " visit-button--compact" : ""}${visit ? " visit-button--scheduled" : ""}${isOverdue ? " visit-button--overdue" : ""}`}
        onClick={open}
        title={visit ? "Visit — change, mark done or cancel" : "Schedule a visit"}
      >
        {visit ? <CalendarCheck size={compact ? 13 : 15} /> : <CalendarPlus size={compact ? 13 : 15} />}
        {visit ? `Visit · ${visitDayLabel(visit.day, today)}` : "Schedule visit"}
      </button>

      {step.kind !== "closed" && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={step.kind === "locating" ? undefined : close} />
          <div className="modal">
            {step.kind === "edit" && (
              <>
                <div className="modal__title">{visit ? "Visit" : "Schedule a visit"}</div>
                <div className="invoice-details__summary-row" style={{ marginBottom: 12 }}>
                  {customerName}
                  {visit && (
                    <span className={`visit-day-tag${isOverdue ? " visit-day-tag--overdue" : ""}`} style={{ marginLeft: 8 }}>
                      {visitDayLabel(visit.day, today)}
                    </span>
                  )}
                </div>

                <div className="field-label">{visit ? "Change the day" : "Day"}</div>
                <DayPickerRow options={options} selectedDate={day} onSelect={setDay} disabled={isSaving} />
                <label className="visit-other-date">
                  <span>Or a date</span>
                  <input
                    type="date"
                    className="input"
                    value={otherDate}
                    min={options[0]?.date}
                    onChange={(e) => setDay(e.target.value || null)}
                    disabled={isSaving}
                  />
                </label>

                {error && <div className="form-error">{error}</div>}
                <div className="invoice-details__actions" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={close}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={isSaving || !day || day === visit?.day}
                    onClick={save}
                  >
                    {isSaving ? "Saving..." : visit ? "Change day" : "Schedule"}
                  </button>
                </div>

                {visit && (
                  <div className="visit-done-actions">
                    <button type="button" className="btn btn--primary btn--full visit-mark-done" disabled={isSaving} onClick={markVisited}>
                      <MapPin size={15} /> Mark visited
                    </button>
                    <button
                      type="button"
                      className="link-btn btn--danger-text"
                      disabled={isSaving}
                      onClick={() => setStep({ kind: "confirmCancel" })}
                    >
                      Cancel this visit
                    </button>
                  </div>
                )}
              </>
            )}

            {step.kind === "locating" && (
              <>
                <div className="modal__title">Mark visited</div>
                <div className="visit-status-line">
                  <Loader2 size={16} className="refresh-button__icon--spinning" />
                  {isSaving ? "Checking the location…" : "Getting this phone's location…"}
                </div>
              </>
            )}

            {step.kind === "noLocation" && (
              <>
                <div className="modal__title">Location unavailable</div>
                <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
                  {step.reason}. Mark the visit done without checking the location?
                </div>
                {error && <div className="form-error">{error}</div>}
                <div className="invoice-details__actions">
                  <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={() => setStep({ kind: "edit" })}>
                    Back
                  </button>
                  <button type="button" className="btn btn--primary" disabled={isSaving} onClick={() => finish({ method: "not_checked" })}>
                    {isSaving ? "Saving..." : "Mark visited"}
                  </button>
                </div>
              </>
            )}

            {step.kind === "result" && (
              <>
                <div className="modal__title">Visit done</div>
                <div className={`notify-banner ${resultMessage(step.visit).ok ? "notify-banner--success" : "notify-banner--failed"}`}>
                  {resultMessage(step.visit).ok ? (
                    <CheckCircle2 className="notify-banner__icon" size={14} />
                  ) : (
                    <TriangleAlert className="notify-banner__icon" size={14} />
                  )}
                  <span>{resultMessage(step.visit).text}</span>
                </div>
                {step.canSaveLocation && step.position && !locationSaved && (
                  <div className="invoice-details__summary-row" style={{ margin: "12px 0" }}>
                    Save where you are now as {customerName}'s map location, so future visits can be checked?
                  </div>
                )}
                {locationSaved && <div className="settings-saved">Location saved.</div>}
                {error && <div className="form-error">{error}</div>}
                <div className="invoice-details__actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={close}>
                    {step.canSaveLocation && !locationSaved ? "Not now" : "Close"}
                  </button>
                  {step.canSaveLocation && step.position && !locationSaved && (
                    <button type="button" className="btn btn--primary" disabled={isSaving} onClick={() => saveLocation(step.position!)}>
                      {isSaving ? "Saving..." : "Save location"}
                    </button>
                  )}
                </div>
              </>
            )}

            {step.kind === "confirmCancel" && (
              <>
                <div className="modal__title">Cancel this visit?</div>
                <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
                  {customerName} will no longer be pinned as a customer to visit.
                </div>
                <div className="invoice-details__actions">
                  <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={() => setStep({ kind: "edit" })}>
                    Keep it
                  </button>
                  <button type="button" className="btn btn--secondary btn--danger-text" disabled={isSaving} onClick={cancel}>
                    {isSaving ? "Cancelling..." : "Cancel visit"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
