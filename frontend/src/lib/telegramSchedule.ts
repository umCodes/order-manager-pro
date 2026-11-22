/** The business runs on UTC+3 ("Etc/GMT-3" is UTC+3 in the IANA naming), whatever the device's time zone. */
const BUSINESS_TIME_ZONE = "Etc/GMT-3";

/** "Thu 12:00 AM" — when a held message goes out, in business time. */
export function scheduledSendLabel(dueAt: number) {
  return new Date(dueAt).toLocaleString("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).replace(",", "");
}

/** "Thu 26 Nov, 12:00 AM" — the full form, for tooltips and the Messages tab. */
export function scheduledSendDateTime(dueAt: number) {
  const day = new Date(dueAt).toLocaleDateString("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = new Date(dueAt).toLocaleTimeString("en-US", { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  return `${day.replace(",", "")}, ${time}`;
}
