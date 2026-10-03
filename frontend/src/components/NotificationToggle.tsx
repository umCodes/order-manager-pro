import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { fetchPushPublicKey } from "../lib/api";
import {
  disablePush,
  enablePush,
  getPushState,
  getPushSupport,
  resyncPushSubscription,
  type PushState,
} from "../lib/push";

type Info = { title: string; message: string };

const HOME_SCREEN_INFO: Info = {
  title: "Add to Home Screen first",
  message:
    "On iPhone, notifications only work from the app on your Home Screen. In Safari tap Share → \"Add to Home Screen\", open the app from that icon, then tap the bell again.",
};

/**
 * Bell button that turns push notifications for inbound WhatsApp messages
 * on or off for this device. Hidden when the browser can't do push at all
 * or the server has no push key configured.
 */
export default function NotificationToggle() {
  const support = getPushSupport();
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    if (support !== "supported") return;
    let cancelled = false;
    fetchPushPublicKey()
      .then((key) => {
        if (!cancelled) setIsConfigured(key !== null);
      })
      .catch(() => {
        if (!cancelled) setIsConfigured(false);
      });
    getPushState()
      .then((current) => {
        if (cancelled) return;
        setState(current);
        // Make sure the server still knows this device.
        if (current === "on") resyncPushSubscription().catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, [support]);

  if (support === "unsupported") return null;
  if (support === "supported" && (isConfigured !== true || state === null)) return null;

  function handleClick() {
    if (support === "needs-home-screen") {
      setInfo(HOME_SCREEN_INFO);
      return;
    }
    if (state === "blocked") {
      setInfo({
        title: "Notifications are blocked",
        message: "Allow notifications for this app in your phone's settings (or the browser's site settings), then tap the bell again.",
      });
      return;
    }
    setIsBusy(true);
    const action = state === "on" ? disablePush() : enablePush();
    action
      .then(() => getPushState())
      .then((next) => {
        setState(next);
        if (next === "on") {
          setInfo({ title: "Notifications on", message: "You'll get a notification on this device for every WhatsApp message a customer sends, even when the app is closed." });
        }
      })
      .catch((e) => {
        getPushState().then(setState).catch(() => {});
        setInfo({ title: "Couldn't change notifications", message: e instanceof Error ? e.message : "Something went wrong." });
      })
      .finally(() => setIsBusy(false));
  }

  const isOn = state === "on";
  const label = support === "needs-home-screen" ? "Enable notifications" : isOn ? "Turn off notifications" : "Turn on notifications";

  return (
    <>
      <button
        type="button"
        className={`icon-btn notification-toggle${isOn ? " notification-toggle--on" : ""}`}
        onClick={handleClick}
        disabled={isBusy}
        aria-label={label}
        aria-pressed={support === "supported" ? isOn : undefined}
        title={label}
      >
        {isBusy ? (
          <Loader2 size={14} className="refresh-button__icon--spinning" />
        ) : isOn ? (
          <Bell size={14} />
        ) : (
          <BellOff size={14} />
        )}
      </button>
      {info && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={() => setInfo(null)} />
          <div className="modal">
            <div className="modal__title">{info.title}</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              {info.message}
            </div>
            <button type="button" className="btn btn--primary btn--full" onClick={() => setInfo(null)}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
