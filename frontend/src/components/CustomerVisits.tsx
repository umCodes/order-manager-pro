import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPin, Phone } from "lucide-react";
import { importCustomerVisits, markCustomerVisited, type VisitCustomerType, type CustomerVisit } from "../lib/api";
import { refreshVisits, useVisits } from "../lib/visits";
import { currency } from "../lib/currency";
import RefreshButton from "./RefreshButton";

type Filter = "due" | VisitCustomerType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "due", label: "To visit" },
  { key: "new", label: "New" },
  { key: "regular", label: "Regular" },
  { key: "occasional", label: "Occasional" },
  { key: "rare", label: "Rare" },
  { key: "potential", label: "Potential" },
];

const TYPE_LABELS: Record<VisitCustomerType, string> = {
  new: "New",
  regular: "Regular",
  occasional: "Occasional",
  rare: "Rare",
  potential: "Potential",
};

/** How the last visit was recorded; a manual "Mark visited" needs no label. */
const KIND_LABELS = { purchase: " (invoice)", payment: " (payment)", manual: "" } as const;

function daysText(days: number) {
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

/** The status line under a customer's name. */
function visitLine(c: CustomerVisit) {
  if (!c.last_visit) {
    if (c.type === "potential") return "Never bought · no reminders";
    return c.days_since !== undefined ? `Never visited · added ${daysText(c.days_since)}` : "Never visited";
  }
  const kind = c.last_visit_kind ? KIND_LABELS[c.last_visit_kind] : "";
  if (c.visited_recently) return `Visited ${daysText(c.days_since ?? 0)}${kind}`;
  return `${c.days_since} days since last visit${kind}`;
}

/**
 * "To visit": customers due a visit (regular every 7 days, everyone else
 * every 14), most overdue first, plus a pill per customer type. Visits are
 * recorded by the app (an invoice marked sent, a payment, or "Mark visited");
 * customers visited in their current cycle show green.
 */
export default function CustomerVisits({
  onBack,
  onSelectCustomer,
}: {
  onBack: () => void;
  onSelectCustomer: (customerId: string) => void;
}) {
  const { state, error } = useVisits();
  const [filter, setFilter] = useState<Filter>("due");
  const [marking, setMarking] = useState<CustomerVisit | null>(null);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshVisits();
  }, []);

  const customers = state?.customers ?? [];
  const visible = filter === "due" ? customers.filter((c) => c.due) : customers.filter((c) => c.type === filter);

  function countFor(key: Filter) {
    if (!state) return undefined;
    return key === "due" ? state.due : state.counts[key];
  }

  function handleMarkVisited() {
    if (!marking) return;
    setIsSaving(true);
    setSaveError(null);
    markCustomerVisited(marking.customer_id, note)
      .then(() => refreshVisits())
      .then(() => {
        setMarking(null);
        setNote("");
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to record the visit"))
      .finally(() => setIsSaving(false));
  }

  function handleImport() {
    setIsImporting(true);
    setImportMessage(null);
    importCustomerVisits()
      .then((result) => {
        setImportMessage(`Imported ${result.purchases} invoices and ${result.payments} payments for ${result.customers} customers.`);
        return refreshVisits();
      })
      .catch((e) => setImportMessage(e instanceof Error ? e.message : "Import failed"))
      .finally(() => setIsImporting(false));
  }

  return (
    <div>
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to customers">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title visits__title">To visit</h1>
        <div className="page-header__actions">
          <RefreshButton onRefresh={refreshVisits} />
        </div>
      </div>
      <p className="page-subtitle">Regular customers every week, everyone else every 2 weeks</p>

      {state && !state.imported_at && (
        <div className="visits__import">
          <div>
            <strong>Start from your real history.</strong> Import past invoices and payments from Zoho once, so existing
            customers aren't all shown as new.
          </div>
          <button type="button" className="btn btn--primary" onClick={handleImport} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import from Zoho"}
          </button>
        </div>
      )}
      {importMessage && <div className="visits__import-result">{importMessage}</div>}

      <div className="wa-chips visits__pills" role="group" aria-label="Filter customers">
        {FILTERS.map(({ key, label }) => {
          const count = countFor(key);
          return (
            <button
              key={key}
              type="button"
              className={`wa-chip${filter === key ? " wa-chip--active" : ""}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {label}
              {key === "due" && count ? (
                <span className="unread-badge unread-badge--chip visits__due-badge">{count}</span>
              ) : (
                count !== undefined && <span className="wa-chip__count">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {error && !state && <div className="form-error">{error}</div>}
      {!state && !error && <div className="items-area__empty">Loading...</div>}
      {state && visible.length === 0 && (
        <div className="items-area__empty">{filter === "due" ? "Nobody to visit right now 🎉" : "No customers here"}</div>
      )}

      <div className="visits__list">
        {visible.map((c) => (
          <div key={c.customer_id} className={`visit-card${c.visited_recently ? " visit-card--visited" : ""}${c.due ? " visit-card--due" : ""}`}>
            <button type="button" className="visit-card__main" onClick={() => onSelectCustomer(c.customer_id)}>
              <div className="visit-card__top">
                <span className="visit-card__name">{c.name}</span>
                <span className={`visit-type visit-type--${c.type}`}>{TYPE_LABELS[c.type]}</span>
              </div>
              {(c.city || c.district) && (
                <div className="visit-card__place">{[c.district, c.city].filter(Boolean).join(", ")}</div>
              )}
              <div className="visit-card__status">
                {c.visited_recently && <CheckCircle2 size={13} className="visit-card__check" />}
                {visitLine(c)}
                {c.due && c.overdue_days > 0 && c.last_visit && (
                  <span className="visit-card__overdue">{c.overdue_days}d overdue</span>
                )}
              </div>
              {c.last_visit_note && <div className="visit-card__note">“{c.last_visit_note}”</div>}
              <div className="visit-card__meta">
                {c.last_purchase ? `Last invoice ${c.last_purchase}` : "No invoices yet"}
                {c.typical_gap_days !== undefined && ` · buys every ~${c.typical_gap_days} days`}
                {c.balance > 0 && ` · owes ${currency(c.balance)}`}
              </div>
            </button>
            <div className="visit-card__actions">
              {c.location_link && (
                <a className="icon-btn" href={c.location_link} target="_blank" rel="noreferrer" aria-label="Open location" title="Location">
                  <MapPin size={14} />
                </a>
              )}
              {c.phone && (
                <a className="icon-btn" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} aria-label="Call" title="Call">
                  <Phone size={14} />
                </a>
              )}
              <button
                type="button"
                className="btn btn--secondary visit-card__mark"
                onClick={() => {
                  setSaveError(null);
                  setNote("");
                  setMarking(c);
                }}
              >
                Mark visited
              </button>
            </div>
          </div>
        ))}
      </div>

      {marking && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={isSaving ? undefined : () => setMarking(null)} />
          <div className="modal">
            <div className="modal__title">Visited {marking.name}</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              For visits with no invoice or payment. Invoices marked sent and payments count as visits by themselves.
            </div>
            <div className="field">
              <label className="field-label" htmlFor="visit-note">
                Note (optional)
              </label>
              <textarea
                id="visit-note"
                className="input"
                rows={2}
                placeholder="e.g. Interested, come back Monday"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {saveError && <div className="form-error">{saveError}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={() => setMarking(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" disabled={isSaving} onClick={handleMarkVisited}>
                {isSaving ? "Saving..." : "Mark visited"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
