import type { CatalogItem } from "../types";

/** Zoho's default unit list (Settings > Items > Units), as the backend translates them (backend/src/utils/units.ts). */
export const STANDARD_UNITS = [
  "pcs", "pack", "box", "dz", "pair", "kg", "g", "mg", "lb", "oz", "ton",
  "in", "ft", "cm", "mm", "m", "km", "ml", "l", "gal", "qt", "sqft", "sqm", "hrs", "days",
];

/**
 * Units a general item's line can be set to: Zoho's standard ones plus any
 * other unit the catalog's items use, `current` first if it's unusual.
 */
export function unitOptions(catalog: CatalogItem[], current?: string): string[] {
  const seen = new Set<string>();
  const units: string[] = [];
  for (const unit of [current ?? "", ...STANDARD_UNITS, ...catalog.map((item) => item.unit ?? "")]) {
    const trimmed = unit.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    units.push(trimmed);
  }
  return units;
}
