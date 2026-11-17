/**
 * Shared checks for the app's touch gestures (swipe back, drag a sheet down,
 * pull to refresh), so none of them fights text selection or typing: a
 * gesture never starts while text is selected, nor from a text field.
 */

/** True while the user has text selected anywhere on the page. */
export function hasTextSelection() {
  const selection = window.getSelection?.();
  return !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
}

/** True when the touch began in something you type in, where a drag means moving the caret or selecting. */
export function startedInTextField(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable='true'], [data-no-gesture]");
}

/** Whether a gesture may start for this touch. */
export function canStartGesture(event: TouchEvent) {
  return event.touches.length === 1 && !hasTextSelection() && !startedInTextField(event.target);
}

/** iPhone/iPad, where the app draws its own edge swipe back (Android has the system back gesture). */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
