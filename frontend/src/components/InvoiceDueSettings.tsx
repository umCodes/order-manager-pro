import { useEffect, useState } from "react";
import { fetchInvoiceDueSetting, saveInvoiceDueSetting, type InvoiceDueSetting } from "../lib/api";

const PRESET_DAYS = [7, 14, 30, 45, 60];

const sameSetting = (a: InvoiceDueSetting, b: InvoiceDueSetting) =>
  a.period === b.period && (a.period === "month" || a.days === (b as { days: number }).days);

/**
 * Settings → Overdue after: how long a new invoice has before Zoho marks it
 * overdue — one calendar month (the default) or a number of days. Applies to
 * invoices created from now on.
 */
export default function InvoiceDueSettings() {
  const [saved, setSaved] = useState<InvoiceDueSetting | null>(null);
  const [maxDays, setMaxDays] = useState(365);
  const [period, setPeriod] = useState<"month" | "days">("month");
  const [daysText, setDaysText] = useState("30");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function apply(setting: InvoiceDueSetting) {
    setSaved(setting);
    setPeriod(setting.period);
    if (setting.period === "days") setDaysText(String(setting.days));
  }

  useEffect(() => {
    fetchInvoiceDueSetting()
      .then((loaded) => {
        setMaxDays(loaded.maxDays);
        apply(loaded.selected);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load the overdue period"));
  }, []);

  const days = Number(daysText);
  const daysValid = daysText.trim() !== "" && Number.isInteger(days) && days >= 0 && days <= maxDays;
  const draft: InvoiceDueSetting | null = period === "month" ? { period: "month" } : daysValid ? { period: "days", days } : null;
  const isDirty = !!saved && !!draft && !sameSetting(saved, draft);

  function save() {
    if (!draft) return;
    setIsSaving(true);
    setSaveError(null);
    saveInvoiceDueSetting(draft)
      .then((selected) => {
        apply(selected);
        setSavedAt(Date.now());
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setIsSaving(false));
  }

  function choose(next: "month" | "days", nextDays?: number) {
    setSavedAt(null);
    setPeriod(next);
    if (nextDays !== undefined) setDaysText(String(nextDays));
  }

  return (
    <>
      <div className="page-header" style={{ marginTop: 28 }}>
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Overdue after
        </h2>
      </div>
      <p className="page-subtitle">
        How long a new invoice has before it's overdue: its due date is set this long after the day it's created. Invoices already created
        keep their due date.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {!saved && !loadError && <div className="items-area__empty">Loading…</div>}

      {saved && (
        <div className="settings-group">
          <div className="customer-tx__periods invoice-due__choices">
            <button
              type="button"
              className={`customer-tx__period${period === "month" ? " customer-tx__period--active" : ""}`}
              onClick={() => choose("month")}
            >
              1 month
            </button>
            {PRESET_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className={`customer-tx__period${period === "days" && days === d ? " customer-tx__period--active" : ""}`}
                onClick={() => choose("days", d)}
              >
                {d} days
              </button>
            ))}
          </div>

          <label className="invoice-due__custom">
            <span>Or a number of days</span>
            <input
              type="number"
              className="input"
              inputMode="numeric"
              min={0}
              max={maxDays}
              value={period === "days" ? daysText : ""}
              placeholder="e.g. 21"
              onChange={(e) => {
                choose("days");
                setDaysText(e.target.value);
              }}
            />
          </label>
          {period === "days" && !daysValid && <div className="form-error">Enter a whole number of days from 0 to {maxDays}.</div>}

          {saveError && <div className="form-error">{saveError}</div>}
          {savedAt && !isDirty && <div className="settings-saved">Saved</div>}
          <button type="button" className="btn btn--primary btn--full" disabled={!isDirty || isSaving} onClick={save}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </>
  );
}
