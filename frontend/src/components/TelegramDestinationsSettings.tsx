import { useEffect, useState } from "react";
import { fetchTelegramDestinations, saveTelegramDestinations, type TelegramDestinationsSetting } from "../lib/api";

/**
 * Settings → Telegram → Where messages go: the channel and/or the preparers'
 * group, for messages the app sends because of something done in it
 * (invoices, their changes, reschedules, Messages tab). Both on by default.
 */
export default function TelegramDestinationsSettings() {
  const [setting, setSetting] = useState<TelegramDestinationsSetting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchTelegramDestinations()
      .then(setSetting)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load where Telegram messages go"));
  }, []);

  function toggle(key: "channel" | "group", value: boolean) {
    if (!setting) return;
    const previous = setting;
    const next = { channel: setting.channel, group: setting.group, [key]: value };
    setSetting({ ...setting, ...next });
    setIsSaving(true);
    setSaveError(null);
    saveTelegramDestinations(next)
      .then(setSetting)
      .catch((e) => {
        setSetting(previous);
        setSaveError(e instanceof Error ? e.message : "Failed to save");
      })
      .finally(() => setIsSaving(false));
  }

  const nothingSent = setting && !setting.channel && (!setting.group || setting.groupAvailable === false);

  return (
    <>
      <div className="page-header" style={{ marginTop: 24 }}>
        <h2 className="page-title" style={{ fontSize: 16 }}>
          Where messages go
        </h2>
      </div>
      <p className="page-subtitle">
        For messages sent because of something done in the app: invoices, their changes, reschedules and the Messages tab.
        Backup lists, daily reports and the bot's answers to the preparers aren't affected. An order already posted keeps its
        changes where it was posted.
      </p>

      {loadError && <div className="form-error">{loadError}</div>}
      {!setting && !loadError && <div className="items-area__empty">Loading…</div>}

      {setting && (
        <>
          <label className="settings-toggle">
            <input type="checkbox" checked={setting.channel} disabled={isSaving} onChange={(e) => toggle("channel", e.target.checked)} />
            <span>Send to channel</span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={setting.group}
              disabled={isSaving || setting.groupAvailable === false}
              onChange={(e) => toggle("group", e.target.checked)}
            />
            <span>Send to group{setting.groupAvailable === false ? " (no group is set up)" : ""}</span>
          </label>
          {nothingSent && <div className="form-error">Both are off: invoices won't be sent to Telegram at all.</div>}
        </>
      )}
      {saveError && <div className="form-error">{saveError}</div>}
    </>
  );
}
