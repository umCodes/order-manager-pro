import { canStartGesture } from "./gestures";
import { haptic } from "./haptics";

/**
 * Pull down at the top of a tab to refresh it, like a native list. The
 * tab's own refresh button does the work (so each tab refreshes exactly as
 * its button does); tabs without one simply don't pull. Only on the tabs
 * themselves — not while an invoice, customer or window is open on top.
 */

const TRIGGER_PX = 70;
const MAX_PULL_PX = 110;

function tabRefreshButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(".app-frame > .app-frame__body .refresh-button");
}

function somethingOnTop() {
  return !!document.querySelector(".layer-root, .modal-overlay, .sheet-overlay--open");
}

export function installPullToRefresh() {
  const indicator = document.createElement("div");
  indicator.className = "pull-refresh";
  indicator.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
  document.body.appendChild(indicator);

  let startY = 0;
  let pulling = false;
  let decided = false;
  let distance = 0;
  let button: HTMLButtonElement | null = null;

  const show = (pull: number) => {
    indicator.style.setProperty("--pull", `${pull}px`);
    indicator.style.setProperty("--pull-turn", `${(pull / TRIGGER_PX) * 270}deg`);
    indicator.classList.toggle("pull-refresh--ready", pull >= TRIGGER_PX * 0.62);
  };
  const hide = () => {
    indicator.classList.remove("pull-refresh--visible", "pull-refresh--ready", "pull-refresh--spinning", "pull-refresh--dragging");
    indicator.style.removeProperty("--pull");
  };

  document.addEventListener(
    "touchstart",
    (event) => {
      pulling = false;
      if (window.scrollY > 0 || somethingOnTop() || !canStartGesture(event)) return;
      button = tabRefreshButton();
      if (!button || button.disabled) return;
      startY = event.touches[0]!.clientY;
      pulling = true;
      decided = false;
      distance = 0;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (!pulling) return;
      const dy = event.touches[0]!.clientY - startY;
      if (!decided) {
        if (Math.abs(dy) < 6) return;
        decided = true;
        if (dy < 0 || window.scrollY > 0) {
          pulling = false;
          return;
        }
        indicator.classList.add("pull-refresh--visible", "pull-refresh--dragging");
      }
      event.preventDefault();
      // Resists more the further it's pulled, like a native list.
      distance = Math.min(MAX_PULL_PX, Math.max(0, dy) * 0.55);
      show(distance);
    },
    { passive: false },
  );

  const end = () => {
    if (!pulling) return;
    pulling = false;
    indicator.classList.remove("pull-refresh--dragging");
    if (!decided || distance < TRIGGER_PX * 0.62 || !button) {
      hide();
      return;
    }
    haptic("medium");
    show(TRIGGER_PX * 0.7);
    indicator.classList.add("pull-refresh--spinning");
    const refresh = button;
    refresh.click();
    // Spins until the tab's refresh button is done (it's disabled while refreshing).
    const started = performance.now();
    const poll = window.setInterval(() => {
      if ((!refresh.disabled && performance.now() - started > 400) || !refresh.isConnected || performance.now() - started > 15000) {
        window.clearInterval(poll);
        hide();
      }
    }, 120);
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
}
