import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { fetchServerHealth } from "../lib/api";

/** How long to wait before admitting the server might be asleep, not just slow. */
const SLOW_MESSAGE_DELAY_MS = 12000;

type Status = "checking" | "ready" | "error";

/**
 * Gates the rest of the app behind one health check on load. The backend
 * runs on a free Render instance that can be asleep, so the very first
 * request may take anywhere from instant to ~30-60s while it wakes up. This
 * shows a spinner right away (so the app never looks frozen) and only
 * escalates the message to "waking up" once the wait has actually dragged on
 * — the request itself isn't given an artificial timeout, since a slow
 * response from a waking server is success, not failure.
 */
export default function ServerWakeupGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [isSlow, setIsSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const slowTimer = setTimeout(() => {
      if (!cancelled) setIsSlow(true);
    }, SLOW_MESSAGE_DELAY_MS);

    fetchServerHealth()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      })
      .finally(() => {
        clearTimeout(slowTimer);
      });

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  if (status === "ready") return <>{children}</>;

  return (
    <div className="server-wakeup">
      {status === "checking" ? (
        <>
          <RefreshCw className="server-wakeup__spinner" size={28} />
          <div className="server-wakeup__title">Loading…</div>
          {isSlow && (
            <div className="server-wakeup__subtitle">
              The server is waking up — this can take a little longer than usual.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="server-wakeup__title">Couldn't reach the server</div>
          <div className="server-wakeup__subtitle">Check your connection and try again.</div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setStatus("checking");
              setIsSlow(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
