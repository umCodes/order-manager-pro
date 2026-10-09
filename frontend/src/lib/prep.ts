import type { PrepLineItem, PrepOrder } from "../types";
import { describeScheduledDay, groupByScheduledDay } from "./scheduledDate";

/*
 * The preparers' screen speaks the same Amharic as the Telegram message the
 * team already reads: items by their Amharic description, weights as
 * "10ኪሎ" / "500ግራም" (a box is 10 kilos), days as ዛሬ / ነገ / weekday.
 */

const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ሮብ", "ሐሙስ", "ጁምአ", "ቅዳሜ"];
const BOX_KILOS = 10;

/** Where one line stands: nothing recorded yet, all of it went out, some of it, or none of it. */
export type LineStatus = "todo" | "full" | "short" | "none";

/** Where a whole order stands; "partial" means some lines are recorded and some aren't yet. */
export type OrderStatus = "todo" | "partial" | "done" | "short";

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

/** "10ኪሎ", or "500ግራም" under a kilo — the Telegram message's weight format. */
export function formatWeight(kilos: number): string {
  if (kilos > 0 && kilos < 1) return `${formatQuantity(kilos * 1000)}ግራም`;
  return `${formatQuantity(kilos)}ኪሎ`;
}

export function lineKilos(line: PrepLineItem): { needed: number; shipped: number | null } {
  return {
    needed: toKilos(line.quantity, line.unit),
    shipped: line.shipped === null ? null : toKilos(line.shipped, line.unit),
  };
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

export function lineStatus(line: PrepLineItem): LineStatus {
  if (line.shipped === null) return "todo";
  // Small tolerance: kilos typed for a box line come back as a fraction of a box.
  if (line.shipped >= line.quantity - 1e-9) return "full";
  if (line.shipped === 0) return "none";
  return "short";
}

export function orderStatus(order: PrepOrder): OrderStatus {
  const statuses = order.line_items.map(lineStatus);
  if (statuses.every((status) => status === "todo")) return "todo";
  if (statuses.some((status) => status === "todo")) return "partial";
  if (statuses.every((status) => status === "full")) return "done";
  return "short";
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
  /** Totals in kilos, so boxes and kilos of the same item add up. */
  neededKilos: number;
  /** Sum of what's been recorded so far (lines not done yet count as 0). */
  shippedKilos: number;
  lines: ItemLine[];
};

/** The day's orders rolled up per item (by its Amharic name), each with who it's for. */
export function groupLinesByItem(orders: PrepOrder[]): PrepItem[] {
  const byLabel = new Map<string, PrepItem>();
  for (const order of orders) {
    for (const line of order.line_items) {
      const label = itemLabel(line);
      let item = byLabel.get(label);
      if (!item) {
        item = { label, neededKilos: 0, shippedKilos: 0, lines: [] };
        byLabel.set(label, item);
      }
      const kilos = lineKilos(line);
      item.neededKilos += kilos.needed;
      item.shippedKilos += kilos.shipped ?? 0;
      item.lines.push({ order, line });
    }
  }
  // Biggest first, the same order the Items tab copies them in.
  return Array.from(byLabel.values()).sort((a, b) => b.neededKilos - a.neededKilos);
}

export type DaySummary = {
  orderCount: number;
  /** Orders with every line recorded (in full or not). */
  finishedCount: number;
  shortLineCount: number;
  notShippedLineCount: number;
};

export function summarizeDay(orders: PrepOrder[]): DaySummary {
  const lines = orders.flatMap((order) => order.line_items);
  return {
    orderCount: orders.length,
    finishedCount: orders.filter((order) => order.line_items.every((line) => line.shipped !== null)).length,
    shortLineCount: lines.filter((line) => lineStatus(line) === "short").length,
    notShippedLineCount: lines.filter((line) => lineStatus(line) === "none").length,
  };
}

/**
 * The day's differences as a Telegram-style message: the day line, then per
 * order that went out short its number and customer, and one
 * "{shipped} {item} (ከ{needed})" line per short or missing item.
 */
export function formatDayReport(date: string | null, orders: PrepOrder[]): string {
  const day = amharicDay(date);
  const summary = summarizeDay(orders);
  const header = `${day.icon} ለ${day.label} — ${summary.finishedCount}/${summary.orderCount} ትዕዛዝ ወጥቷል`;
  const blocks = orders
    .map((order) => {
      const lines = order.line_items
        .filter((line) => lineStatus(line) === "short" || lineStatus(line) === "none")
        .map((line) => {
          const kilos = lineKilos(line);
          return `${formatWeight(kilos.shipped ?? 0)} ${itemLabel(line)} (ከ${formatWeight(kilos.needed)})`;
        });
      return lines.length ? [`${order.invoice_number} · ${order.customer_name}:`, ...lines].join("\n") : null;
    })
    .filter((block): block is string => block !== null);
  return blocks.length ? [header, ...blocks].join("\n\n") : `${header}\n\n✅ ሁሉም ሙሉ ወጥቷል`;
}
