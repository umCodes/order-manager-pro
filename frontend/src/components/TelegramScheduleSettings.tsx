import { useEffect, useState } from "react";
import { fetchTelegramScheduleSetting, saveTelegramScheduleSetting } from "../lib/api";

/** "00:00" → "12:00 AM", "13:30" → "1:30 PM". */
function twelveHour(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Settings → Telegram → Send time: an invoice dated a later day isn't posted
 * when it's made, but at this time on its day. Midnight by default.
 */
export default function TelegramScheduleSettings() {
  const [saved, setSaved] = useState<string | null>(null);
  const [sendTime, setSendTime] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetchTelegramScheduleSetting()
      .then((setting) => {
        setSaved(setting.sendTime);
        setSendTime(setting.sendTime);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load the Telegram send time"));
  }, []);

  const isDirty = saved !== null && sendTime !== saved;

  function save() {
    setIsSaving(true);
    setSaveError(null);
    saveTelegramScheduleSetting({ sendTime })
      .then((setting) => {
        setSaved(setting.sendTime);
        setSendTime(setting.sendTime);
        setSavedAt(Date.now());
      })
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setIsSaving(false));
  }

  return (
    <>
      <div className="page-header">
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Send time for dated invoices
        </h2>
      </div>
      <p className="page-subtitle">
        An invoice for a later day isn't sent to Telegram when it's made. It's held and sent at this time on its day. Invoices
        for today, or with no date, are sent straight away. A second run 30 minutes later sends anything the first one missed.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {saved === null && !loadError && <div className="items-area__empty">Loading…</div>}

      {saved !== null && (
        <div className="settings-group">
          <label className="invoice-due__custom">
            <span>Send at</span>
            <input
              type="time"
              className="input"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
            />
          </label>
          {sendTime && <div className="page-subtitle">{twelveHour(sendTime)} on the invoice's day</div>}
          {saveError && <div className="form-error">{saveError}</div>}
          {savedAt && !isDirty && <div className="settings-saved">Saved</div>}
          <button type="button" className="btn btn--primary btn--full" disabled={!isDirty || !sendTime || isSaving} onClick={save}>
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </>
  );
}
