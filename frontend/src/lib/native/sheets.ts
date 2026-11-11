import { useEffect, useState } from "react";
import { canStartGesture, hasTextSelection } from "./gestures";
import { haptic } from "./haptics";

/**
 * Every window in the app (`.modal` in a `.modal-overlay`, and the Add Items
 * `.sheet`) comes up from the bottom as a native sheet (see the CSS). This
 * adds the rest of the behaviour, app-wide, without touching each window:
 * dragging a sheet down closes it, and the phone's back button closes the
 * top window first (see useOpenWindow / closeTopWindow).
 *
 * A window closes the way its own backdrop does — by "tapping" that
 * backdrop — so a window that can't be closed right now (it's saving) just
 * springs back.
 */

const WINDOW_SELECTOR = ".modal-overlay, .sheet-overlay--open";

function openWindows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(WINDOW_SELECTOR));
}

function backdropOf(overlay: HTMLElement) {
  return overlay.querySelector<HTMLElement>(":scope > .modal-overlay__backdrop, :scope > .sheet-overlay__backdrop");
}

/** Closes the top window as tapping outside it would. Returns false when it has no way to close. */
export function closeTopWindow(): boolean {
  const windows = openWindows();
  const top = windows[windows.length - 1];
  const backdrop = top && backdropOf(top);
  if (!backdrop) return false;
  backdrop.click();
  return true;
}

/** Whether any window is open, kept up to date as windows come and go. */
export function useOpenWindow(): boolean {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIsOpen(openWindows().length > 0));
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    check();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return isOpen;
}

/** Whether any scrollable box between the touch and the sheet (inclusive) is scrolled away from its top. */
function isScrolledWithin(target: Element, sheet: HTMLElement) {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0) return true;
    if (el === sheet) break;
  }
  return false;
}

const CLOSE_PX = 110;
const FLICK_PX_PER_MS = 0.6;

/** Drag a sheet down to close it. Installed once for the whole app. */
export function installSheetDrag() {
  let sheet: HTMLElement | null = null;
  let overlay: HTMLElement | null = null;
  let startY = 0;
  let startX = 0;
  let startTime = 0;
  let decided = false;
  let dy = 0;

  const reset = () => {
    if (sheet) {
      sheet.classList.remove("sheet-dragging");
      sheet.style.removeProperty("transform");
    }
    if (overlay) backdropOf(overlay)?.style.removeProperty("opacity");
  };

  document.addEventListener(
    "touchstart",
    (event) => {
      const target = event.target as Element | null;
      const found = target?.closest?.<HTMLElement>(".modal, .sheet");
      sheet = null;
      if (!found || !canStartGesture(event)) return;
      // Only when nothing it's in is scrolled down, so scrolling a long sheet still scrolls.
      if (isScrolledWithin(target!, found)) return;
      sheet = found;
      overlay = found.closest<HTMLElement>(".modal-overlay, .sheet-overlay");
      startY = event.touches[0]!.clientY;
      startX = event.touches[0]!.clientX;
      startTime = performance.now();
      decided = false;
      dy = 0;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (!sheet) return;
      const touch = event.touches[0]!;
      const moveY = touch.clientY - startY;
      const moveX = touch.clientX - startX;
      if (!decided) {
        if (Math.abs(moveY) < 8 && Math.abs(moveX) < 8) return;
        decided = true;
        if (moveY <= 0 || Math.abs(moveX) > Math.abs(moveY) || hasTextSelection()) {
          sheet = null;
          return;
        }
        sheet.classList.add("sheet-dragging");
      }
      event.preventDefault();
      dy = Math.max(0, moveY);
      sheet.style.transform = `translateY(${dy}px)`;
      const backdrop = overlay && backdropOf(overlay);
      if (backdrop) backdrop.style.opacity = String(Math.max(0.2, 1 - dy / 400));
    },
    { passive: false },
  );

  const end = () => {
    if (!sheet || !decided) {
      sheet = null;
      return;
    }
    const velocity = dy / Math.max(1, performance.now() - startTime);
    const dragged = sheet;
    const draggedOverlay = overlay;
    sheet.classList.remove("sheet-dragging");
    if (dy > CLOSE_PX || velocity > FLICK_PX_PER_MS) {
      dragged.style.transform = "translateY(100%)";
      haptic("medium");
      window.setTimeout(() => {
        const backdrop = draggedOverlay && backdropOf(draggedOverlay);
        backdrop?.click();
        // Still there (it can't close right now): spring back.
        window.setTimeout(() => {
          if (dragged.isConnected && draggedOverlay?.matches(WINDOW_SELECTOR)) {
            dragged.style.removeProperty("transform");
            backdrop?.style.removeProperty("opacity");
          }
        }, 80);
      }, 180);
    } else {
      reset();
    }
    sheet = null;
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
}
