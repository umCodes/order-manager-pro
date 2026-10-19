import { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import RefreshButton from "./RefreshButton";
import PhoneInput from "./PhoneInput";
import {
  fetchDailyReportWhatsAppSettings,
  saveDailyReportWhatsAppSettings,
  type DailyReportTemplateOption,
  type DailyReportWhatsAppSettings as Settings,
} from "../lib/api";

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "under review",
  IN_APPEAL: "under appeal",
};

const refKey = (ref: { name: string; language: string } | null | undefined) => (ref ? `${ref.name}::${ref.language}` : "");

/**
 * Settings → Daily report on WhatsApp: which template the report goes out
 * with (only ones with a document header and {{1}}–{{5}} are offered — a
 * template still under review can be picked ahead of approval) and up to
 * three numbers it's sent to. Sending itself is from the Daily report button.
 */
export default function DailyReportWhatsAppSettings() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [options, setOptions] = useState<DailyReportTemplateOption[]>([]);
  const [maxRecipients, setMaxRecipients] = useState(3);
  const [templateKey, setTemplateKey] = useState("");
  // Numbers as PhoneInput gives them ("+966…"); blank entries are dropped on save.
  const [phones, setPhones] = useState<string[]>([""]);
  // Remounts the phone fields after a load/save so they show the stored numbers.
  const [phonesVersion, setPhonesVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function apply(selected: Settings) {
    setSaved(selected);
    setTemplateKey(refKey(selected.template));
    setPhones(selected.recipients.length ? selected.recipients.map((p) => `+${p}`) : [""]);
    setPhonesVersion((v) => v + 1);
  }

  function load(force = false) {
    return fetchDailyReportWhatsAppSettings(force)
      .then((loaded) => {
        setLoadError(null);
        setOptions(loaded.options);
        setMaxRecipients(loaded.maxRecipients);
        apply(loaded.selected);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load the daily report settings"));
  }

  useEffect(() => {
    load();
  }, []);

  const digits = (phone: string) => phone.replace(/\D/g, "");
  const cleanPhones = phones.map(digits).filter(Boolean);
  const isDirty =
    saved !== null &&
    (templateKey !== refKey(saved.template) || cleanPhones.join(",") !== saved.recipients.join(","));
  const chosenMissing = !!templateKey && !options.some((t) => refKey(t) === templateKey);

  function save() {
    const option = options.find((t) => refKey(t) === templateKey);
    const template = option
      ? { name: option.name, language: option.language }
      : templateKey && saved?.template && refKey(saved.template) === templateKey
        ? saved.template
        : null;
    setIsSaving(true);
    setSaveError(null);
    saveDailyReportWhatsAppSettings({ template, recipients: cleanPhones })
      .then((selected) => {
        apply(selected);
        setSavedAt(Date.now());
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setIsSaving(false));
  }

  return (
    <>
      <div className="page-header" style={{ marginTop: 28 }}>
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Daily report on WhatsApp
        </h2>
        <RefreshButton onRefresh={() => load(true)} />
      </div>
      <p className="page-subtitle">
        The template and numbers the daily report PDF is sent to. Send it from the Daily report button on the Drafts tab.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {!saved && !loadError && <div className="items-area__empty">Loading…</div>}

      {saved && (
        <div className="settings-group">
          <div className="field">
            <label className="field-label" htmlFor="daily-report-template">
              Template
            </label>
            <div className="select-wrap">
              <select
                id="daily-report-template"
                className="select"
                value={templateKey}
                onChange={(e) => {
                  setSavedAt(null);
                  setTemplateKey(e.target.value);
                }}
              >
                <option value="">None — not sent</option>
                {chosenMissing && saved.template && (
                  <option value={templateKey}>
                    {saved.template.name} ({saved.template.language}) — unavailable
                  </option>
                )}
                {options.map((t) => (
                  <option key={t.id} value={refKey(t)}>
                    {t.name} ({t.language}) — {STATUS_LABELS[t.status] ?? t.status.toLowerCase()}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-wrap__chevron" size={16} />
            </div>
            {options.length === 0 && (
              <div className="settings-group__description" style={{ marginTop: 6 }}>
                No template fits yet: it needs a Document header and exactly the variables {"{{1}}"}–{"{{5}}"}.
              </div>
            )}
          </div>

          <div className="field">
            <div className="field-label">Send to (up to {maxRecipients} numbers)</div>
            <div className="daily-report-phones">
              {phones.map((phone, index) => (
                <div key={`${phonesVersion}-${index}`} className="daily-report-phones__row">
                  <PhoneInput
                    value={phone}
                    onChange={(value) => {
                      setSavedAt(null);
                      setPhones((current) => current.map((p, i) => (i === index ? value : p)));
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label="Remove number"
                    title="Remove number"
                    onClick={() => {
                      setSavedAt(null);
                      setPhones((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : [""]));
                      setPhonesVersion((v) => v + 1);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {phones.length < maxRecipients && (
              <button
                type="button"
                className="link-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8 }}
                onClick={() => setPhones((current) => [...current, ""])}
              >
                <Plus size={14} /> Add number
              </button>
            )}
          </div>

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
