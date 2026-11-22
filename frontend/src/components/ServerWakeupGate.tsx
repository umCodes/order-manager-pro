import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchServerHealth } from "../lib/api";

/** How long to wait before admitting the server might be asleep, not just slow. */
const SLOW_MESSAGE_DELAY_MS = 12000;
/** How long the launch screen takes to fade out over the app (matches .splash's transition). */
const FADE_OUT_MS = 300;

type Status = "checking" | "ready" | "error";

/**
 * Gates the rest of the app behind one health check on load. The backend
 * runs on a free Render instance that can be asleep, so the very first
 * request may take anywhere from instant to ~30-60s while it wakes up.
 *
 * Meanwhile it shows the launch screen — the app's icon and name, with an
 * activity indicator below — the same one index.html shows before any script
 * has loaded (its styles live there), so opening the app looks like a native
 * app launching. The message only escalates to "starting up" once the wait
 * has actually dragged on; the request itself isn't given an artificial
 * timeout, since a slow response from a waking server is success, not
 * failure. Once ready, the app renders underneath and the launch screen
 * fades away over it.
 */
export default function ServerWakeupGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [isSlow, setIsSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isSplashGone, setIsSplashGone] = useState(false);

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

  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(() => setIsSplashGone(true), FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [status]);

  if (status === "ready") {
    return (
      <>
        {children}
        {!isSplashGone && <LaunchScreen leaving />}
      </>
    );
  }

  return (
    <LaunchScreen>
      {status === "checking" ? (
        <>
          <ActivityIndicator />
          {isSlow && <div className="splash__text">Starting up, this can take up to a minute.</div>}
        </>
      ) : (
        <>
          <div className="splash__title">Couldn't reach the server</div>
          <div className="splash__text">Check your connection and try again.</div>
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
    </LaunchScreen>
  );
}

/** The launch screen (styled in index.html): icon and name in the middle, status at the bottom. */
function LaunchScreen({ children, leaving }: { children?: ReactNode; leaving?: boolean }) {
  // Starts visible and fades on the next frame, so the transition actually runs.
  const [isFading, setIsFading] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const frame = requestAnimationFrame(() => setIsFading(true));
    return () => cancelAnimationFrame(frame);
  }, [leaving]);

  return (
    <div className={`splash${isFading ? " splash--leaving" : ""}`} aria-busy={!leaving} aria-hidden={leaving || undefined}>
      <div className="splash__brand">
        <img className="splash__icon" src="/logo.svg" alt="" width={96} height={96} />
        <div className="splash__name">Order Manager Pro</div>
      </div>
      <div className="splash__status">{leaving ? <ActivityIndicator /> : children}</div>
    </div>
  );
}

/** iOS-style activity indicator: twelve bars fading in turn. */
function ActivityIndicator() {
  return (
    <div className="splash__spinner" role="progressbar" aria-label="Loading">
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
