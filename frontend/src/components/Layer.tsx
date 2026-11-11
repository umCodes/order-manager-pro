import { useEffect, useRef, useState, type ReactNode } from "react";
import { canStartGesture, isIOS, prefersReducedMotion } from "../lib/native/gestures";
import { requestBack } from "../lib/native/history";
import { haptic } from "../lib/native/haptics";

/** How long a layer takes to slide in or out (matches the CSS). */
const SLIDE_MS = 320;
/** A swipe back starts this close to the screen's left edge… */
const EDGE_PX = 24;
/** …and goes back once it's dragged past this share of the width (or flicked). */
const COMMIT_RATIO = 0.35;
const FLICK_PX_PER_MS = 0.5;

type Props = {
  open: boolean;
  /** Stacking: which layer this is (customer / invoice / top / settings), see .layer-root--*. */
  level: "customer" | "invoice" | "top" | "settings";
  /** Another layer is open above this one: it sits back, shifted left and dimmed. */
  covered?: boolean;
  children: ReactNode;
};

/**
 * A full-screen layer (invoice, customer, Settings) that behaves like a
 * native pushed screen: slides in from the right over a dimming scrim, slides
 * back out when closed, sits back when another opens on top of it, and on
 * iPhone follows a swipe from the left edge to go back (Android has its own
 * back gesture, handled through the history, see lib/native/history).
 * Keeps showing its last content while it slides out.
 */
export default function Layer({ open, level, covered, children }: Props) {
  const [isMounted, setIsMounted] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  // What it showed while open, kept on screen while it slides out.
  const [shown, setShown] = useState<ReactNode>(children);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIsMounted(true);
  }
  if (open && shown !== children) setShown(children);
  const isClosing = isMounted && !open;

  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open || !isMounted) return;
    const timer = window.setTimeout(() => setIsMounted(false), prefersReducedMotion() ? 0 : SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open, isMounted]);

  // iPhone: swipe from the left edge to go back, the screen following the finger.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !isMounted || !isIOS()) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let dragging = false;
    let decided = false;
    let lastX = 0;

    const setDrag = (x: number) => {
      panel.style.setProperty("--drag-x", `${x}px`);
      if (scrimRef.current) scrimRef.current.style.opacity = String(1 - x / panel.offsetWidth);
    };
    const reset = () => {
      panel.classList.remove("layer-panel--dragging");
      panel.style.removeProperty("--drag-x");
      if (scrimRef.current) scrimRef.current.style.removeProperty("opacity");
    };

    function onStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || touch.clientX - panel!.getBoundingClientRect().left > EDGE_PX || !canStartGesture(event)) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = performance.now();
      decided = false;
      dragging = true;
      lastX = 0;
    }
    function onMove(event: TouchEvent) {
      if (!dragging) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        // Mostly vertical: it's a scroll, not a swipe back.
        if (Math.abs(dy) > Math.abs(dx) || dx < 0) {
          dragging = false;
          return;
        }
        panel!.classList.add("layer-panel--dragging");
      }
      event.preventDefault();
      lastX = Math.max(0, dx);
      setDrag(lastX);
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      if (!decided) return;
      const velocity = lastX / Math.max(1, performance.now() - startTime);
      panel!.classList.remove("layer-panel--dragging");
      if (lastX > panel!.offsetWidth * COMMIT_RATIO || velocity > FLICK_PX_PER_MS) {
        haptic("medium");
        // Slides out from where the finger left it; if the page refuses (unsaved changes), it springs back.
        requestBack();
        window.setTimeout(() => {
          if (panelRef.current?.isConnected && !panelRef.current.classList.contains("layer-panel--closing")) reset();
        }, 120);
      } else {
        reset();
      }
    }

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [isMounted]);

  if (!isMounted) return null;

  return (
    <div className={`layer-root layer-root--${level}`}>
      <div ref={scrimRef} className={`layer-scrim${isClosing ? " layer-scrim--closing" : ""}`} />
      <div
        ref={panelRef}
        className={`detail-overlay layer-panel${isClosing ? " layer-panel--closing" : ""}${covered && !isClosing ? " layer-panel--covered" : ""}`}
      >
        <div className="app-frame__body">{shown}</div>
      </div>
    </div>
  );
}
