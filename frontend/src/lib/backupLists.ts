import type { BackupList } from "../types";

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
  /** What's left of it on each list. */
  parts: { list_id: string; created_at: string; remaining: number; unit: string }[];
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
        parts: unitEntries.map(({ list, item }) => ({ list_id: list.id, created_at: list.created_at, remaining: left(item), unit: item.unit })),
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
