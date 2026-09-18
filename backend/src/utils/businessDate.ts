/**
 * The server may run in any timezone (Render's default is UTC), but the
 * business itself operates in UTC+3 (Saudi Arabia / Ethiopia). Using
 * `new Date().toISOString().slice(0, 10)` computes "today" in the server's
 * timezone, which drifts from the business's calendar day for ~3 hours after
 * each local midnight — payments/invoices made 00:00-03:00 business time get
 * stamped with yesterday's date. This computes "today" in the fixed business
 * offset instead, regardless of where the server process runs.
 */
const BUSINESS_UTC_OFFSET_HOURS = 3;

/** Today's date as YYYY-MM-DD in the business's calendar (UTC+3), not the server's. */
export function todayInBusinessTimezone(): string {
  return formatInBusinessTimezone(new Date());
}

/** The date `days` days before today, as YYYY-MM-DD in the business's calendar. */
export function daysAgoInBusinessTimezone(days: number): string {
  return formatInBusinessTimezone(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function formatInBusinessTimezone(date: Date): string {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compares a YYYY-MM-DD date-only string (e.g. invoice.date) against "today"
 * and "tomorrow", both in the business's calendar (UTC+3) rather than the
 * server's local time — a date-only string has no time-of-day, so it must be
 * compared as a calendar date, not parsed into a UTC instant and re-read
 * with server-local accessors (which is what `new Date(dateStr).toDateString()`
 * does, and drifts from the business's actual day near midnight).
 */
export function describeBusinessDate(dateStr: string, from: Date = new Date()) {
  const todayStr = formatInBusinessTimezone(from);
  const tomorrowStr = formatInBusinessTimezone(new Date(from.getTime() + 24 * 60 * 60 * 1000));
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return {
    isToday: dateStr === todayStr,
    isTomorrow: dateStr === tomorrowStr,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/**
 * The "business day" doesn't reset at midnight — the shop is still running
 * its previous day's shift for the first few hours after midnight, so the
 * boundary is 5am business time instead. Used to key the daily estimate/
 * collected-today Redis entries (see services/dailyTotals.ts) so they cover
 * "today" the way staff actually think of it, not the calendar date.
 */
const BUSINESS_DAY_CUTOFF_HOUR = 5;

/** Today's "business day" (YYYY-MM-DD, business timezone, 5am-to-5am), for keying per-day Redis entries. */
export function businessDayKey(from: Date = new Date()): string {
  const shifted = new Date(from.getTime() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  if (shifted.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    shifted.setUTCDate(shifted.getUTCDate() - 1);
  }
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Seconds from `from` until the next 5am business-day boundary — the TTL for per-day Redis entries. */
export function secondsUntilNextBusinessDay(from: Date = new Date()): number {
  const shifted = new Date(from.getTime() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const boundary = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0,
  ));
  if (shifted.getUTCHours() >= BUSINESS_DAY_CUTOFF_HOUR) {
    boundary.setUTCDate(boundary.getUTCDate() + 1);
  }
  // boundary was computed in shifted (business) time — shift back to get the real instant.
  const boundaryInstant = boundary.getTime() - BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  return Math.max(1, Math.round((boundaryInstant - from.getTime()) / 1000));
}
