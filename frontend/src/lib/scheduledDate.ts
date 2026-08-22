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

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
  const date = new Date(dateStr);
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
