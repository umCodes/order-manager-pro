import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, X } from "lucide-react";
import {
  assignNotificationTemplate,
  clearNotificationTemplate,
  fetchNotificationTemplates,
  type NotificationTemplateSettings,
} from "../lib/api";
import RefreshButton from "./RefreshButton";

const CUSTOMER_LANGUAGES: Record<string, string> = { am: "Amharic", ar: "Arabic", en: "English" };

const STATUS_LABELS: Record<string, string> = { PENDING: "in review", IN_APPEAL: "in appeal", PAUSED: "paused" };

const optionValue = (t: { name: string; language: string }) => `${t.name}|${t.language}`;

/**
 * Settings for the automatic WhatsApp notifications (payment confirmation,
 * invoice sent): which template each one uses for customers of each
 * preferred language. Saved on the server (Redis) as soon as one is picked;
 * a slot nobody has set here still uses the old server env var, if any.
 */
export default function NotificationTemplates({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<NotificationTemplateSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "<kind>:<language>" of the row being saved, and the last row's error.
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<{ slot: string; message: string } | null>(null);

  function load(force = false) {
    return fetchNotificationTemplates(force)
      .then((result) => {
        setSettings(result);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load notification templates"));
  }

  useEffect(() => {
    load();
  }, []);

  function save(slot: string, request: Promise<NotificationTemplateSettings>) {
    setSavingSlot(slot);
    setSlotError(null);
    request
      .then(setSettings)
      .catch((e) => setSlotError({ slot, message: e instanceof Error ? e.message : "Failed to save" }))
      .finally(() => setSavingSlot(null));
  }

  return (
    <div>
      <div className="wa-list__toolbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to templates">
          <ArrowLeft size={18} />
        </button>
        <div className="wa-templates__title">Notification templates</div>
        <RefreshButton onRefresh={() => load(true)} />
      </div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        The templates the app sends automatically, per customer's preferred language.
      </p>

      {error && <div className="form-error">{error}</div>}
      {settings === null && !error && <div className="items-area__empty">Loading...</div>}

      {settings?.notifications.map((notification) => {
        const usable = notification.options.filter((o) => !o.incompatible && o.status !== "REJECTED" && o.status !== "DISABLED");
        const unusable = notification.options.filter((o) => o.incompatible);
        return (
          <div key={notification.kind} className="wa-notification">
            <div className="wa-notification__title">{notification.label}</div>
            <div className="wa-template__hint" style={{ marginTop: 0 }}>
              {notification.description} Fills{" "}
              {notification.bodyVariables.map((v, i) => `{{${i + 1}}} ${v.toLowerCase()}`).join(", ")}
              {notification.header === "DOCUMENT" && ", with the invoice PDF as a document header"}.
            </div>

            {notification.slots.map(({ language, current }) => {
              const slot = `${notification.kind}:${language}`;
              const isSaving = savingSlot === slot;
              // Keep the current choice selectable even if it no longer fits (e.g. edited in Meta).
              const currentListed = current && usable.some((o) => optionValue(o) === optionValue(current));
              return (
                <div key={language} className="wa-notification__slot">
                  <label className="field-label" htmlFor={`nt-${slot}`}>
                    {CUSTOMER_LANGUAGES[language] ?? language} customers
                  </label>
                  <div className="wa-notification__row">
                    <div className="select-wrap" style={{ flex: 1, minWidth: 0 }}>
                      <select
                        id={`nt-${slot}`}
                        className="select"
                        value={current ? optionValue(current) : ""}
                        disabled={isSaving}
                        onChange={(e) => {
                          const [name, templateLanguage] = e.target.value.split("|");
                          if (name) save(slot, assignNotificationTemplate(notification.kind, language, { name, language: templateLanguage }));
                        }}
                      >
                        {!current && <option value="">Not set — choose a template</option>}
                        {current && !currentListed && <option value={optionValue(current)}>{`${current.name} · ${current.language}`}</option>}
                        {usable.map((o) => (
                          <option key={optionValue(o)} value={optionValue(o)}>
                            {`${o.name} · ${o.language}${STATUS_LABELS[o.status] ? ` (${STATUS_LABELS[o.status]})` : ""}`}
                          </option>
                        ))}
                        {unusable.length > 0 && (
                          <optgroup label="Don't fit this notification">
                            {unusable.map((o) => (
                              <option key={optionValue(o)} value={optionValue(o)} disabled>
                                {`${o.name} — ${o.incompatible}`}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <ChevronDown className="select-wrap__chevron" size={18} />
                    </div>
                    {current?.source === "app" && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Clear"
                        title="Clear"
                        disabled={isSaving}
                        onClick={() => save(slot, clearNotificationTemplate(notification.kind, language))}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {isSaving && <div className="wa-template__hint">Saving...</div>}
                  {current?.source === "env" && !isSaving && (
                    <div className="wa-template__hint">From the server's settings (env var) — pick one here to replace it.</div>
                  )}
                  {!current && !isSaving && (
                    <div className="wa-template__hint wa-notification__unset">Not set: this notification won't be sent to {CUSTOMER_LANGUAGES[language] ?? language} customers.</div>
                  )}
                  {slotError?.slot === slot && <div className="form-error" style={{ marginTop: 6 }}>{slotError.message}</div>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
