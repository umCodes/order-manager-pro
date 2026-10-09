import type { PrepLineItem, PrepOrder, PrepStep } from "../types";
import { describeScheduledDay, groupByScheduledDay } from "./scheduledDate";

/*
 * The preparers' and drivers' screens. Each draft line goes through three
 * recorded steps: prepared (preparer), sent (preparer, checked against what
 * was prepared) and received (driver, checked against what was sent). A
 * received amount that differs from what was sent is a conflict.
 *
 * Data reads like the Telegram message the team already knows: items by
 * their Amharic description, weights as "10ኪሎ" / "500ግራም" (a box is 10
 * kilos), days as ዛሬ / ነገ / weekday.
 */

const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ሮብ", "ሐሙስ", "ጁምአ", "ቅዳሜ"];
const BOX_KILOS = 10;
const EPSILON = 1e-9;

/**
 * Where one line stands at a step: not done yet, waiting on the step before,
 * all of it, part of it, none of it, or (sent / received) a conflict between
 * what the preparer sent and what the driver received.
 */
export type LineStatus = "todo" | "waiting" | "full" | "short" | "none" | "conflict";

/** Where a whole order stands at a step. */
export type OrderStatus = "waiting" | "todo" | "partial" | "done" | "short" | "conflict";

/** A line's Amharic display name: its description, as on the Telegram message and Amharic invoices. */
export function itemLabel(line: { name: string; description: string }): string {
  return line.description.trim() || line.name;
}

/** A line quantity in kilos: boxes are 10 kilos each, everything else is already kilos. */
export function toKilos(quantity: number, unit: string): number {
  return unit === "box" ? quantity * BOX_KILOS : quantity;
}

/** Kilos back into the line's own unit, for saving. */
export function fromKilos(kilos: number, unit: string): number {
  return unit === "box" ? kilos / BOX_KILOS : kilos;
}

/** Trims float noise ("9.000001" → "9") without forcing decimals on whole numbers. */
export function formatQuantity(quantity: number): string {
  return String(Math.round(quantity * 1000) / 1000);
}

/** "10ኪሎ", "2.5ኪሎ", or "500ግራም" under a kilo — the Telegram message's weight format. */
export function formatWeight(kilos: number): string {
  if (kilos > 0 && kilos < 1) return `${formatQuantity(kilos * 1000)}ግራም`;
  return `${formatQuantity(kilos)}ኪሎ`;
}

/** The one-tap button's label per step: everything still open goes in full. */
export const ALL_DONE_LABEL: Record<PrepStep, { all: string; rest: string }> = {
  prepared: { all: "All ready", rest: "Rest ready" },
  sent: { all: "All sent", rest: "Rest sent" },
  received: { all: "All received", rest: "Rest received" },
};

/** The step before, whose amount a step is checked against (prepared is checked against the order itself). */
const PREVIOUS_STEP: Record<PrepStep, PrepStep | null> = { prepared: null, sent: "prepared", received: "sent" };

/** What a step is expected to match, in the line's unit: the ordered amount, or the previous step's amount (null if not done yet). */
export function expectedAmount(line: PrepLineItem, step: PrepStep): number | null {
  const previous = PREVIOUS_STEP[step];
  return previous ? line[previous] : line.quantity;
}

export function hasConflict(line: PrepLineItem): boolean {
  return line.sent !== null && line.received !== null && Math.abs(line.sent - line.received) > EPSILON;
}

export function lineStatus(line: PrepLineItem, step: PrepStep): LineStatus {
  const expected = expectedAmount(line, step);
  const value = line[step];
  if (step !== "prepared" && hasConflict(line)) return "conflict";
  if (expected === null) return "waiting";
  if (value === null) return "todo";
  if (value >= expected - EPSILON) return "full";
  if (value <= EPSILON) return "none";
  return "short";
}

export function orderStatus(order: PrepOrder, step: PrepStep): OrderStatus {
  const statuses = order.line_items.map((line) => lineStatus(line, step));
  if (statuses.includes("conflict")) return "conflict";
  if (statuses.every((status) => status === "waiting")) return "waiting";
  if (statuses.every((status) => status === "todo" || status === "waiting")) return "todo";
  if (statuses.some((status) => status === "todo" || status === "waiting")) return "partial";
  if (statuses.every((status) => status === "full")) return "done";
  return "short";
}

/** Lines that can be recorded at this step right now (the step before is done) but aren't yet. */
export function openLines(order: PrepOrder, step: PrepStep): PrepLineItem[] {
  return order.line_items.filter((line) => line[step] === null && expectedAmount(line, step) !== null);
}

/** How many lines have this step recorded. */
export function recordedCount(order: PrepOrder, step: PrepStep): number {
  return order.line_items.filter((line) => line[step] !== null).length;
}

/** A scheduled day in Amharic: ዛሬ / ነገ / ትላንት / weekday, with the Telegram message's colour icon. */
export function amharicDay(date: string | null): { label: string; icon: string; shortDate: string } {
  if (!date) return { label: "ቀን ያልተሰጠው", icon: "🗓️", shortDate: "" };
  const info = describeScheduledDay(date);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [year, month, day] = date.split("-").map(Number);
  const asDate = new Date(year, month - 1, day);
  const isYesterday = asDate.toDateString() === yesterday.toDateString();
  const label =
    info.label === "Today" ? "ዛሬ" : info.label === "Tomorrow" ? "ነገ" : isYesterday ? "ትላንት" : AMHARIC_WEEKDAYS[asDate.getDay()];
  const icon = info.label === "Today" ? "🟢" : info.label === "Tomorrow" ? "🟡" : "🗓️";
  return { label, icon, shortDate: info.shortDate };
}

export type PrepDay = {
  /** YYYY-MM-DD, or null for undated drafts. */
  date: string | null;
  orders: PrepOrder[];
  /** Drafts from an earlier day that never went out, shown under today (as on the Drafts tab). */
  carriedOverCount: number;
};

/** Splits the drafts into one group per scheduled day, past-due ones under today. */
export function groupOrdersByDay(orders: PrepOrder[], from: Date = new Date()): PrepDay[] {
  return groupByScheduledDay(orders, (order) => order.date, from).map((group) => ({
    date: group.date,
    orders: group.entries.map((entry) => entry.value),
    carriedOverCount: group.entries.filter((entry) => entry.isCarriedOver).length,
  }));
}

/** One line as seen from the item's side: which order it belongs to. */
export type ItemLine = { order: PrepOrder; line: PrepLineItem };

export type PrepItem = {
  /** Amharic display name (the description). */
  label: string;
  /** What this step is expected to reach, in kilos (only lines whose previous step is done). */
  expectedKilos: number;
  /** What's been recorded at this step so far, in kilos. */
  doneKilos: number;
  lines: ItemLine[];
};

/** The orders rolled up per item (by its Amharic name) for one step, each with who it's for. Totals are in kilos so boxes and kilos add up. */
export function groupLinesByItem(orders: PrepOrder[], step: PrepStep): PrepItem[] {
  const byLabel = new Map<string, PrepItem>();
  for (const order of orders) {
    for (const line of order.line_items) {
      const label = itemLabel(line);
      let item = byLabel.get(label);
      if (!item) {
        item = { label, expectedKilos: 0, doneKilos: 0, lines: [] };
        byLabel.set(label, item);
      }
      item.expectedKilos += toKilos(expectedAmount(line, step) ?? 0, line.unit);
      item.doneKilos += toKilos(line[step] ?? 0, line.unit);
      item.lines.push({ order, line });
    }
  }
  // Biggest first, the same order the Items tab copies them in.
  return Array.from(byLabel.values()).sort((a, b) => b.expectedKilos - a.expectedKilos);
}

export type StepSummary = {
  orderCount: number;
  /** Orders with this step recorded on every line. */
  finishedCount: number;
  shortLineCount: number;
  conflictLineCount: number;
};

export function summarizeStep(orders: PrepOrder[], step: PrepStep): StepSummary {
  const lines = orders.flatMap((order) => order.line_items);
  return {
    orderCount: orders.length,
    finishedCount: orders.filter((order) => recordedCount(order, step) === order.line_items.length).length,
    shortLineCount: lines.filter((line) => ["short", "none"].includes(lineStatus(line, step))).length,
    conflictLineCount: lines.filter(hasConflict).length,
  };
}

/**
 * The day's problems as a Telegram-style message: per order, each line that
 * was prepared short ("9ኪሎ ቲማቲም (ከ10ኪሎ)") and each conflict between what
 * was sent and what the driver received.
 */
export function formatDayReport(date: string | null, orders: PrepOrder[]): string {
  const day = amharicDay(date);
  const sentCount = orders.filter((order) => recordedCount(order, "sent") === order.line_items.length).length;
  const header = `${day.icon} ለ${day.label} — ${sentCount}/${orders.length} ትዕዛዝ ወጥቷል`;
  const blocks = orders
    .map((order) => {
      const lines = order.line_items.flatMap((line) => {
        const out: string[] = [];
        const name = itemLabel(line);
        if (line.prepared !== null && line.prepared < line.quantity - EPSILON) {
          out.push(`${formatWeight(toKilos(line.prepared, line.unit))} ${name} (ከ${formatWeight(toKilos(line.quantity, line.unit))})`);
        }
        if (hasConflict(line)) {
          out.push(
            `⚠️ ${name}: ወጣ ${formatWeight(toKilos(line.sent ?? 0, line.unit))} · ደረሰ ${formatWeight(toKilos(line.received ?? 0, line.unit))}`,
          );
        }
        return out;
      });
      return lines.length ? [`${order.invoice_number} · ${order.customer_name}:`, ...lines].join("\n") : null;
    })
    .filter((block): block is string => block !== null);
  return blocks.length ? [header, ...blocks].join("\n\n") : `${header}\n\n✅ ሁሉም ሙሉ ነው`;
}
