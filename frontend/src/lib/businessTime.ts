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

/** The business day starts at 4am (backend: BUSINESS_DAY_CUTOFF_HOUR): until then it's still the previous day. */
const BUSINESS_DAY_CUTOFF_HOUR = 4;

/**
 * The current business day's date as a Date whose local fields are that day
 * (time of day dropped) — "today" for day pickers that follow the 4am
 * business day rather than midnight.
 */
export function businessDayDate(): Date {
  const now = businessNow();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < BUSINESS_DAY_CUTOFF_HOUR) day.setDate(day.getDate() - 1);
  return day;
}

/** The current business day as YYYY-MM-DD (4am to 4am, business time). */
export function businessDayKey(): string {
  const day = businessDayDate();
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}
