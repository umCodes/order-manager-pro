import type { PrepLineItem, PrepOrder } from "../types";
import { groupByScheduledDay } from "./scheduledDate";

/** Where one line stands: nothing recorded yet, all of it went out, some of it, or none of it. */
export type LineStatus = "todo" | "full" | "short" | "none";

/** Where a whole order stands; "partial" means some lines are recorded and some aren't yet. */
export type OrderStatus = "todo" | "partial" | "done" | "short";

export function lineStatus(line: PrepLineItem): LineStatus {
  if (line.shipped === null) return "todo";
  if (line.shipped >= line.quantity) return "full";
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
  name: string;
  description: string;
  unit: string;
  needed: number;
  /** Sum of what's been recorded so far (lines not done yet count as 0). */
  shipped: number;
  lines: ItemLine[];
};

/** The day's orders rolled up per item (case-insensitive name), each with who it's for. */
export function groupLinesByItem(orders: PrepOrder[]): PrepItem[] {
  const byName = new Map<string, PrepItem>();
  for (const order of orders) {
    for (const line of order.line_items) {
      const key = line.name.toLowerCase();
      let item = byName.get(key);
      if (!item) {
        item = { name: line.name, description: line.description, unit: line.unit, needed: 0, shipped: 0, lines: [] };
        byName.set(key, item);
      }
      item.needed += line.quantity;
      item.shipped += line.shipped ?? 0;
      item.lines.push({ order, line });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
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

/** Trims float noise ("9.000001" → "9") without forcing decimals on whole numbers. */
export function formatQuantity(quantity: number): string {
  return String(Math.round(quantity * 1000) / 1000);
}

/**
 * Plain-text report of a day's differences, for pasting into Telegram:
 * one block per order that went out short, listing each short or missing line.
 */
export function formatDayReport(dayLabel: string, orders: PrepOrder[]): string {
  const summary = summarizeDay(orders);
  const header = `${dayLabel}: ${summary.finishedCount} of ${summary.orderCount} orders out`;
  const blocks = orders
    .map((order) => {
      const lines = order.line_items
        .filter((line) => lineStatus(line) === "short" || lineStatus(line) === "none")
        .map((line) => `- ${line.name}: ${formatQuantity(line.shipped ?? 0)} of ${formatQuantity(line.quantity)} ${line.unit}`);
      return lines.length ? [`${order.customer_name} (${order.invoice_number})`, ...lines].join("\n") : null;
    })
    .filter((block): block is string => block !== null);
  return blocks.length ? [header, ...blocks].join("\n\n") : `${header}\nEverything went out in full.`;
}
