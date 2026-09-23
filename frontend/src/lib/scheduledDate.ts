const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ScheduleOption = {
  date: string;
  label: string;
};

export type ScheduledDayInfo = {
  date: string;
  label: string;
  formattedDate: string;
  isPast: boolean;
};

/** Formats a Date as YYYY-MM-DD using its local calendar date (never UTC — see describeScheduledDay). */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD string as a local-time midnight Date, matching toISODate's local formatting. */
function fromISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}


/** Builds the next 7 days of pickable schedule options, starting today, labeled Today/Tomorrow/weekday. */
export function buildScheduleOptions(from: Date = new Date()): ScheduleOption[] {
  const options: ScheduleOption[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(from);
    date.setDate(from.getDate() + offset);

    const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : WEEKDAY_ABBR[date.getDay()];

    options.push({ date: toISODate(date), label });
  }

  return options;
}

/** Describes an already-chosen scheduled date for display: label, formatted date, and whether it's overdue. */
export function describeScheduledDay(dateStr: string, from: Date = new Date()): ScheduledDayInfo {
  const date = fromISODate(dateStr);
  const tomorrow = new Date(from);
  tomorrow.setDate(from.getDate() + 1);

  const isToday = date.toDateString() === from.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const label = isToday ? "Today" : isTomorrow ? "Tomorrow" : WEEKDAY_ABBR[date.getDay()];

  const formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isPast = startOfDate < startOfToday;

  return { date: dateStr, label, formattedDate, isPast };
}

/**
 * Where an unsent draft belongs on the calendar *today*: its own scheduled
 * date, or — if that date has already passed (e.g. yesterday's delivery that
 * never went out) — today, flagged as carried over. Display-only: the
 * invoice's real date in Zoho is never touched.
 */
export function effectiveScheduledDate(dateStr: string, from: Date = new Date()): { date: string; isCarriedOver: boolean } {
  const today = toISODate(from);
  return dateStr < today ? { date: today, isCarriedOver: true } : { date: dateStr, isCarriedOver: false };
}

export type ScheduledDayGroup<T> = {
  /** The effective day (YYYY-MM-DD), or null for entries with no scheduled date. */
  date: string | null;
  entries: { value: T; isCarriedOver: boolean }[];
};

/**
 * Buckets entries by their effective scheduled day (see
 * effectiveScheduledDate), earliest day first with undated entries last.
 * Entries keep their incoming order within each day.
 */
export function groupByScheduledDay<T>(
  values: T[],
  getDate: (value: T) => string | null | undefined,
  from: Date = new Date(),
): ScheduledDayGroup<T>[] {
  const groups = new Map<string | null, ScheduledDayGroup<T>>();

  for (const value of values) {
    const raw = getDate(value);
    const { date, isCarriedOver } = raw ? effectiveScheduledDate(raw, from) : { date: null, isCarriedOver: false };
    let group = groups.get(date);
    if (!group) {
      group = { date, entries: [] };
      groups.set(date, group);
    }
    group.entries.push({ value, isCarriedOver });
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date.localeCompare(b.date);
  });
}
