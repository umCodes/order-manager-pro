import { useEffect, useState } from "react";
import { fetchInvoiceSentNotifySetting, saveInvoiceSentNotifySetting } from "../lib/api";

/**
 * Settings → Invoices → WhatsApp when marked as sent: by default the
 * invoice goes to every contact of the customer on its own; turned on, the
 * app asks whether to send it and to which contacts first.
 */
export default function InvoiceSentNotifySettings() {
  const [askBeforeSending, setAskBeforeSending] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoiceSentNotifySetting()
      .then((setting) => setAskBeforeSending(setting.askBeforeSending))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load the WhatsApp setting"));
  }, []);

  function toggle(next: boolean) {
    const previous = askBeforeSending;
    setAskBeforeSending(next);
    setIsSaving(true);
    setSaveError(null);
    saveInvoiceSentNotifySetting({ askBeforeSending: next })
      .then((saved) => setAskBeforeSending(saved.askBeforeSending))
      .catch((e) => {
        setAskBeforeSending(previous);
        setSaveError(e instanceof Error ? e.message : "Failed to save");
      })
      .finally(() => setIsSaving(false));
  }

  return (
    <>
      <div className="page-header" style={{ marginTop: 24 }}>
        <h2 className="page-title" style={{ fontSize: 16 }}>
          WhatsApp when marked as sent
        </h2>
      </div>
      <p className="page-subtitle">
        When an invoice is marked as sent, it goes to every contact of the customer on WhatsApp, with its PDF. Turn this on to be
        asked first whether to send it, and to which contacts.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {askBeforeSending === null && !loadError && <div className="items-area__empty">Loading…</div>}

      {askBeforeSending !== null && (
        <label className="settings-toggle">
          <input type="checkbox" checked={askBeforeSending} disabled={isSaving} onChange={(e) => toggle(e.target.checked)} />
          <span>Ask before sending</span>
        </label>
      )}
      {saveError && <div className="form-error">{saveError}</div>}
    </>
  );
}
