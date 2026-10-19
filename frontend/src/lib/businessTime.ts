/**
 * The business runs on UTC+3 (Saudi Arabia / Ethiopia, no daylight saving),
 * the same fixed offset the backend uses (backend/src/utils/businessDate.ts).
 * A phone or laptop may be set to any time zone, so "today", "tomorrow" and
 * "near midnight" are worked out on business time, never the device's own.
 */
const BUSINESS_UTC_OFFSET_MINUTES = 3 * 60;

/**
 * Now, as a Date whose local fields (getDate, getHours, …) read as business
 * time — so the calendar helpers that use local fields agree with the
 * backend whatever time zone the device is set to.
 */
export function businessNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + (BUSINESS_UTC_OFFSET_MINUTES + now.getTimezoneOffset()) * 60_000);
}
