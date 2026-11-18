import type { BackupList, OrderLoadingView } from "../types";

/** "27 Oct, 3:45 PM" in business time (UTC+3), whatever the device's time zone. */
export function sentLabel(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Etc/GMT-3",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export type MergedRow = {
  key: string;
  name: string;
  description: string;
  unit: string;
  remaining: number;
  /**
   * On the lists that were reported (seen to in the Telegram group): what they
   * had, and what the preparers said is available of it. `not_reported` is
   * what's on lists nobody has seen to yet — unknown, not short.
   */
  needed: number;
  available: number;
  not_reported: number;
  /** What's left of it on each list, and the list's own item (for confirming its loading). */
  parts: {
    list_id: string;
    created_at: string;
    remaining: number;
    unit: string;
    quantity: number;
    item_id: string;
    description: string;
    date?: string;
    /** What the preparers said is available on this list; null while nobody has seen to the list. */
    available: number | null;
    /** How much quick invoices took from it. */
    taken: number;
  }[];
};

const round = (value: number) => Math.round(value * 1000) / 1000;
/** A box is 10kg — the only units added together across lists. */
const inKg = (quantity: number, unit: string) => (unit === "box" ? quantity * 10 : quantity);

/**
 * Every list's items added up into one list: the same item (a general item by
 * its description too) in one row, with what's left across all lists. Boxes
 * and kg of one item are added up in kg; any other mix of units stays in
 * separate rows. Oldest list first within a row.
 */
export function mergeBackupLists(lists: BackupList[]): MergedRow[] {
  const groups = new Map<string, { list: BackupList; item: BackupList["items"][number] }[]>();
  for (const list of [...lists].reverse()) {
    for (const item of list.items) {
      const key = item.item_key ?? (item.item_id || item.description);
      groups.set(key, [...(groups.get(key) ?? []), { list, item }]);
    }
  }

  const rows: MergedRow[] = [];
  for (const [key, entries] of groups) {
    const units = new Set(entries.map(({ item }) => item.unit));
    const asKg = units.size > 1 && [...units].every((unit) => unit === "box" || unit === "kg");
    const byUnit = new Map<string, typeof entries>();
    for (const entry of entries) {
      const unit = asKg ? "kg" : entry.item.unit;
      byUnit.set(unit, [...(byUnit.get(unit) ?? []), entry]);
    }
    for (const [unit, unitEntries] of byUnit) {
      const left = (item: BackupList["items"][number]) => item.remaining ?? item.available ?? item.quantity;
      const sum = (amount: (item: BackupList["items"][number]) => number) =>
        round(unitEntries.reduce((total, { item }) => total + (asKg ? inKg(amount(item), item.unit) : amount(item)), 0));
      const seen = unitEntries.filter(({ list }) => list.status && list.status !== "not_reported");
      const unseen = unitEntries.filter((entry) => !seen.includes(entry));
      const sumOf = (subset: typeof unitEntries, amount: (item: BackupList["items"][number]) => number) =>
        round(subset.reduce((total, { item }) => total + (asKg ? inKg(amount(item), item.unit) : amount(item)), 0));
      const first = unitEntries[0].item;
      rows.push({
        key: `${key}|${unit}`,
        name: first.name || first.description,
        description: first.name && first.description !== first.name ? first.description : "",
        unit,
        remaining: sum(left),
        needed: sumOf(seen, (item) => item.quantity),
        available: sumOf(seen, (item) => item.available ?? item.quantity),
        not_reported: sumOf(unseen, (item) => item.quantity),
        parts: unitEntries.map(({ list, item }) => ({
          list_id: list.id,
          created_at: list.created_at,
          remaining: left(item),
          unit: item.unit,
          quantity: item.quantity,
          item_id: item.item_id,
          description: item.description,
          ...(list.date ? { date: list.date } : {}),
          available: list.status && list.status !== "not_reported" ? (item.available ?? item.quantity) : null,
          taken: item.taken ?? 0,
        })),
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** A part's amount in its row's unit: kg when the row adds boxes and kg up (a box is 10kg). */
export function inRowUnit(quantity: number, partUnit: string, rowUnit: string) {
  return round(rowUnit === "kg" && partUnit === "box" ? quantity * 10 : quantity);
}

/** An amount in another unit, when it can be: a box is 10kg; otherwise only the same unit. */
export function convertUnit(quantity: number, from: string, to: string): number | null {
  if (from === to) return quantity;
  if (from === "box" && to === "kg") return round(quantity * 10);
  if (from === "kg" && to === "box") return round(quantity / 10);
  return null;
}

/** An item's backup stock, per list it's on: what the preparers reported ready (less what quick invoices took), and what's on the truck. */
export type BackupStockPart = { unit: string; ready: number | null; truck: number | null };

/**
 * Backup stock by Zoho item id, from the open backup lists: on each list,
 * what's ready (reported available less what quick invoices took; null while
 * nobody has seen to the list) and what's on the truck (confirmed loaded less
 * what quick invoices took; null until the driver confirmed it).
 */
export function backupStockByItem(lists: BackupList[], loadings: Record<string, OrderLoadingView>): Map<string, BackupStockPart[]> {
  const stock = new Map<string, BackupStockPart[]>();
  for (const list of lists) {
    const loaded = new Map((loadings[list.id]?.loading?.items ?? []).map((item) => [item.item_key, item.received]));
    const seen = !!list.status && list.status !== "not_reported";
    for (const item of list.items) {
      if (!item.item_id) continue;
      const taken = item.taken ?? 0;
      const received = loaded.get(item.item_key ?? item.item_id);
      stock.set(item.item_id, [
        ...(stock.get(item.item_id) ?? []),
        {
          unit: item.unit,
          ready: seen ? round(item.remaining ?? (item.available ?? item.quantity) - taken) : null,
          truck: received === undefined ? null : round(Math.max(0, received - taken)),
        },
      ]);
    }
  }
  return stock;
}

/** An item's backup stock added up in `unit` (parts in a unit that can't be converted are left out). */
export function stockIn(parts: BackupStockPart[] | undefined, unit: string): { ready: number | null; truck: number | null } {
  let ready: number | null = null;
  let truck: number | null = null;
  for (const part of parts ?? []) {
    if (part.ready !== null) {
      const value = convertUnit(part.ready, part.unit, unit);
      if (value !== null) ready = round((ready ?? 0) + value);
    }
    if (part.truck !== null) {
      const value = convertUnit(part.truck, part.unit, unit);
      if (value !== null) truck = round((truck ?? 0) + value);
    }
  }
  return { ready, truck };
}
