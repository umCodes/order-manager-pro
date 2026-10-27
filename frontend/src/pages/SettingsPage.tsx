import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import RefreshButton from "../components/RefreshButton";
import CategoryOrderSettings from "../components/CategoryOrderSettings";
import DailyReportWhatsAppSettings from "../components/DailyReportWhatsAppSettings";
import InvoiceDueSettings from "../components/InvoiceDueSettings";
import GeneralItemsSettings from "../components/GeneralItemsSettings";
import GeneralItemsWhatsAppSettings from "../components/GeneralItemsWhatsAppSettings";
import {
  fetchNotificationTemplateSettings,
  saveNotificationTemplateSettings,
  type NotificationKind,
  type NotificationLanguage,
  type NotificationTemplateSettings,
  type NotificationTemplateSlots,
  type TemplateRef,
} from "../lib/api";

type Props = {
  onBack: () => void;
};

const NOTIFICATIONS: { kind: NotificationKind; title: string; description: string }[] = [
  {
    kind: "balance",
    title: "Invoice notice",
    description: "Sent when an invoice is marked as sent, with the invoice PDF attached.",
  },
  {
    kind: "payment",
    title: "Payment confirmation",
    description: "Sent when a payment is recorded.",
  },
  {
    kind: "return",
    title: "Return notice",
    description: "Sent after a return on a sent invoice, with the Return Notice PDF attached.",
  },
  {
    kind: "payment_correction",
    title: "Payment correction",
    description: "Sent when a payment's amount is edited.",
  },
  {
    kind: "payment_deletion",
    title: "Payment deletion",
    description: "Sent when a payment is deleted.",
  },
];

/** One empty slot set per notification, so a kind the server didn't send is never undefined. */
function withAllKinds(slots: Partial<NotificationTemplateSlots> | undefined): NotificationTemplateSlots {
  return Object.fromEntries(NOTIFICATIONS.map(({ kind }) => [kind, slots?.[kind] ?? {}])) as NotificationTemplateSlots;
}

const LANGUAGES: { key: NotificationLanguage; label: string }[] = [
  { key: "am", label: "Amharic customers" },
  { key: "ar", label: "Arabic customers" },
  { key: "en", label: "English customers" },
];

const refKey = (ref: TemplateRef | undefined) => (ref ? `${ref.name}::${ref.language}` : "");
const refLabel = (ref: TemplateRef) => `${ref.name} (${ref.language})`;

function parseRefKey(key: string): TemplateRef | undefined {
  if (!key) return undefined;
  const [name, language] = key.split("::");
  return { name, language };
}

/**
 * App-wide settings, opened from the gear in the header: the Items tab's
 * category priority, and which WhatsApp template each automatic
 * notification goes out with, per customer language. Only approved templates whose variables match what the
 * notification fills in are offered; "Default" uses the server's configured one.
 */
export default function SettingsPage({ onBack }: Props) {
  const [settings, setSettings] = useState<NotificationTemplateSettings | null>(null);
  const [draft, setDraft] = useState<NotificationTemplateSlots>(() => withAllKinds(undefined));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function load(force = false) {
    return fetchNotificationTemplateSettings(force)
      .then((loaded) => {
        setLoadError(null);
        const selected = withAllKinds(loaded.selected);
        setSettings({
          selected,
          defaults: withAllKinds(loaded.defaults),
          options: Object.fromEntries(NOTIFICATIONS.map(({ kind }) => [kind, loaded.options?.[kind] ?? []])) as NotificationTemplateSettings["options"],
        });
        setDraft(selected);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load settings"));
  }

  useEffect(() => {
    load();
  }, []);

  const isDirty =
    settings !== null &&
    NOTIFICATIONS.some(({ kind }) =>
      LANGUAGES.some(({ key }) => refKey(draft[kind][key]) !== refKey(settings.selected[kind][key])),
    );

  function choose(kind: NotificationKind, language: NotificationLanguage, key: string) {
    setSavedAt(null);
    setDraft((prev) => {
      const slots = { ...prev[kind] };
      const ref = parseRefKey(key);
      if (ref) slots[language] = ref;
      else delete slots[language];
      return { ...prev, [kind]: slots };
    });
  }

  function save() {
    setIsSaving(true);
    setSaveError(null);
    saveNotificationTemplateSettings(draft)
      .then((selected) => {
        setSettings((prev) => (prev ? { ...prev, selected: withAllKinds(selected) } : prev));
        setDraft(withAllKinds(selected));
        setSavedAt(Date.now());
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to save settings"))
      .finally(() => setIsSaving(false));
  }

  return (
    <div>
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
      </div>

      <h1 className="page-title" style={{ marginTop: 12 }}>
        Settings
      </h1>

      <CategoryOrderSettings />

      <div className="page-header">
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Notification templates
        </h2>
        <RefreshButton onRefresh={() => load(true)} />
      </div>
      <p className="page-subtitle">
        The WhatsApp template each customer notification is sent with, by the customer's language.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}

      {!settings && !loadError && <div className="items-area__empty">Loading…</div>}

      {settings && (
        <>
          {NOTIFICATIONS.map(({ kind, title, description }) => (
            <div key={kind} className="settings-group">
              <div className="settings-group__title">{title}</div>
              <div className="settings-group__description">{description}</div>

              {LANGUAGES.map(({ key, label }) => {
                const id = `template-${kind}-${key}`;
                const fallback = settings.defaults[kind][key];
                const chosen = draft[kind][key];
                const options = settings.options[kind];
                // A saved choice that's no longer approved/usable still shows, flagged.
                const chosenMissing =
                  chosen && !options.some((t) => refKey(t) === refKey(chosen));

                return (
                  <div key={key} className="field">
                    <label className="field-label" htmlFor={id}>
                      {label}
                    </label>
                    <div className="select-wrap">
                      <select
                        id={id}
                        className="select"
                        value={refKey(chosen)}
                        onChange={(e) => choose(kind, key, e.target.value)}
                      >
                        <option value="">
                          {fallback ? `Default — ${refLabel(fallback)}` : "None chosen — not sent"}
                        </option>
                        {chosenMissing && (
                          <option value={refKey(chosen)}>{refLabel(chosen)} — unavailable</option>
                        )}
                        {options.map((t) => (
                          <option key={t.id} value={refKey(t)}>
                            {refLabel(t)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="select-wrap__chevron" size={16} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {saveError && <div className="form-error">{saveError}</div>}
          {savedAt && !isDirty && <div className="settings-saved">Saved</div>}

          <button
            type="button"
            className="btn btn--primary btn--full"
            disabled={!isDirty || isSaving}
            onClick={save}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </>
      )}

      <InvoiceDueSettings />

      <GeneralItemsSettings />

      <GeneralItemsWhatsAppSettings />

      <DailyReportWhatsAppSettings />
    </div>
  );
}
