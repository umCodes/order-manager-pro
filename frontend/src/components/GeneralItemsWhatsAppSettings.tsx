import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import RefreshButton from "./RefreshButton";
import PhoneInput from "./PhoneInput";
import {
  fetchGeneralItemsWhatsAppSettings,
  saveGeneralItemsWhatsAppSettings,
  type GeneralItemsTemplateOption,
  type GeneralItemsWhatsAppSettings as Settings,
} from "../lib/api";

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "under review",
  IN_APPEAL: "under appeal",
};

const refKey = (ref: { name: string; language: string } | null | undefined) => (ref ? `${ref.name}::${ref.language}` : "");

/**
 * Settings → General items on WhatsApp: the template and number an invoice's
 * general items are sent to, in one message per invoice. Only templates whose
 * body has exactly {{1}} invoice number, {{2}} and {{3}} items, {{4}} day are
 * offered; one still under review can be picked ahead of approval.
 */
export default function GeneralItemsWhatsAppSettings() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [options, setOptions] = useState<GeneralItemsTemplateOption[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  // As PhoneInput gives it ("+966…").
  const [phone, setPhone] = useState("");
  // Remounts the phone field after a load/save so it shows the stored number.
  const [phoneVersion, setPhoneVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function apply(selected: Settings) {
    setSaved(selected);
    setTemplateKey(refKey(selected.template));
    setPhone(selected.recipient ? `+${selected.recipient}` : "");
    setPhoneVersion((v) => v + 1);
  }

  const load = useCallback((force = false) => {
    return fetchGeneralItemsWhatsAppSettings(force)
      .then((loaded) => {
        setLoadError(null);
        setOptions(loaded.options);
        apply(loaded.selected);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load the general items WhatsApp settings"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cleanPhone = phone.replace(/\D/g, "");
  const isDirty =
    saved !== null && (templateKey !== refKey(saved.template) || cleanPhone !== (saved.recipient ?? ""));
  const chosenMissing = !!templateKey && !options.some((t) => refKey(t) === templateKey);
  const chosen = options.find((t) => refKey(t) === templateKey);
  const variablesHelp = "{{1}} invoice number, {{2}} and {{3}} the items (split between them; {{3}} is \"-\" with one item), {{4}} the day.";

  function save() {
    const template = chosen
      ? { name: chosen.name, language: chosen.language }
      : templateKey && saved?.template && refKey(saved.template) === templateKey
        ? saved.template
        : null;
    setIsSaving(true);
    setSaveError(null);
    saveGeneralItemsWhatsAppSettings({ template, recipient: cleanPhone || null })
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
          General items on WhatsApp
        </h2>
        <RefreshButton onRefresh={() => load(true)} />
      </div>
      <p className="page-subtitle">
        When an invoice has general items, they're sent in one message with this template to this number. A draft update only sends the general items it didn't have.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {!saved && !loadError && <div className="items-area__empty">Loading…</div>}

      {saved && (
        <div className="settings-group">
          <div className="field">
            <label className="field-label" htmlFor="general-items-template">
              Template
            </label>
            <div className="select-wrap">
              <select
                id="general-items-template"
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
            <div className="settings-group__description" style={{ marginTop: 6 }}>
              {options.length === 0 ? `No template fits yet. Its body needs exactly: ${variablesHelp}` : `Fills ${variablesHelp}`}
            </div>
          </div>

          <div className="field">
            <div className="field-label">Send to</div>
            <PhoneInput
              key={phoneVersion}
              value={phone}
              onChange={(value) => {
                setSavedAt(null);
                setPhone(value);
              }}
            />
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
