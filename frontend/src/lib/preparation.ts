import type { PrepLineItem, PrepOrder } from "../types";
import { describeScheduledDay, effectiveScheduledDate, groupByScheduledDay } from "./scheduledDate";

/*
 * The preparation screen: the drafts one day at a time (today's including
 * anything overdue, as on the Drafts tab), each line recorded with how much was actually
 * prepared against what was ordered.
 *
 * Weighed items (kilos, and boxes — 10 kilos each, as on the Telegram
 * message) are entered and shown as whole kilos plus grams in steps of 50
 * ("1ኪሎ 500ግራም"), never as decimals. Anything else is a plain count.
 */

const BOX_KILOS = 10;
export const GRAM_STEP = 50;

/** Amharic unit names for counted (non-weighed) items, as on Amharic invoices. */
const AMHARIC_UNITS: Record<string, string> = {
  pcs: "ቁራጭ",
  pack: "እሽግ",
  dz: "ደርዘን",
  pair: "ጥንድ",
  l: "ሊትር",
  ml: "ሚ.ሊ",
  gal: "ጋሎን",
};

/** A line's Amharic display name: its description, as on the Telegram message and Amharic invoices. */
export function itemLabel(line: { name: string; description: string }): string {
  return line.description.trim() || line.name;
}

/** Kilos and boxes are weighed (entered as kilos + grams); everything else is counted. */
export function isWeighed(unit: string): boolean {
  return unit === "kg" || unit === "box";
}

/** A weighed line's quantity in kilos (a box is 10 kilos). */
export function toKilos(quantity: number, unit: string): number {
  return unit === "box" ? quantity * BOX_KILOS : quantity;
}

/** Kilos back into the line's own unit, for saving. */
export function fromKilos(kilos: number, unit: string): number {
  return unit === "box" ? kilos / BOX_KILOS : kilos;
}

/** Whole kilos and leftover grams (rounded to the gram). */
export function splitKilos(kilos: number): { kilos: number; grams: number } {
  const totalGrams = Math.round(kilos * 1000);
  return { kilos: Math.floor(totalGrams / 1000), grams: totalGrams % 1000 };
}

function trim(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** A line amount for display: "1ኪሎ 500ግራም" / "500ግራም" / "10ኪሎ" when weighed, "3 ቁራጭ" otherwise. */
export function formatAmount(quantity: number, unit: string): string {
  if (!isWeighed(unit)) return `${trim(quantity)} ${AMHARIC_UNITS[unit] ?? unit}`.trim();
  const { kilos, grams } = splitKilos(toKilos(quantity, unit));
  if (grams === 0) return `${kilos}ኪሎ`;
  if (kilos === 0) return `${grams}ግራም`;
  return `${kilos}ኪሎ ${grams}ግራም`;
}

/** Where one line stands: not recorded yet, all of it, part of it, or none of it found. */
export type LineStatus = "todo" | "full" | "short" | "none";

/** Where an order stands, for its header. */
export type OrderStatus = "todo" | "prepared" | "partial" | "none";

const EPSILON = 1e-9;

export function lineStatus(line: PrepLineItem): LineStatus {
  if (line.prepared === null) return "todo";
  if (line.prepared >= line.quantity - EPSILON) return "full";
  if (line.prepared <= EPSILON) return "none";
  return "short";
}

export function orderStatus(order: PrepOrder): OrderStatus {
  const statuses = order.line_items.map(lineStatus);
  if (statuses.every((s) => s === "todo")) return "todo";
  if (statuses.every((s) => s === "full")) return "prepared";
  if (statuses.every((s) => s === "none")) return "none";
  return "partial";
}

export function isFullyPrepared(order: PrepOrder): boolean {
  return order.line_items.every((line) => lineStatus(line) === "full");
}

const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ሮብ", "ሐሙስ", "ጁምአ", "ቅዳሜ"];

export type PrepDay = {
  /** YYYY-MM-DD; today's group also holds anything overdue. */
  date: string;
  /** Sorted by invoice number. */
  orders: PrepOrder[];
};

/**
 * The drafts split into one group per day, the way the Drafts tab does it:
 * anything dated before today counts as today. Only days that have orders
 * appear, earliest first; within a day, orders go by invoice number.
 */
export function ordersByDay(orders: PrepOrder[], from: Date = new Date()): PrepDay[] {
  return groupByScheduledDay(orders, (order) => order.date, from)
    .filter((group): group is typeof group & { date: string } => group.date !== null)
    .map((group) => ({
      date: group.date,
      orders: group.entries
        .map((entry) => entry.value)
        .sort((a, b) => a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })),
    }));
}

/** A day's name as on the Telegram message: ዛሬ / ነገ / weekday. */
export function dayLabel(date: string, from: Date = new Date()): string {
  const { label } = describeScheduledDay(date, from);
  if (label === "Today") return "ዛሬ";
  if (label === "Tomorrow") return "ነገ";
  const [year, month, day] = date.split("-").map(Number);
  return AMHARIC_WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

export function isOverdue(order: PrepOrder, from: Date = new Date()): boolean {
  return effectiveScheduledDate(order.date, from).isCarriedOver;
}
