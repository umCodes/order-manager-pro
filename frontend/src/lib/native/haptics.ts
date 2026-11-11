/**
 * A short vibration where the device allows it (Android); iPhones don't let
 * web apps vibrate, so there it's silently nothing.
 */
const PATTERNS = {
  /** A tap that changes something small: switching tabs, arming a confirm. */
  light: 8,
  /** A gesture that went through: a swipe back, a sheet dismissed, a pull to refresh. */
  medium: 14,
  /** A confirmed action: a payment saved, an invoice marked as sent. */
  success: [12, 40, 18],
} as const;

export function haptic(kind: keyof typeof PATTERNS = "light") {
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    // Not allowed (no user gesture yet, or unsupported): nothing to do.
  }
}
