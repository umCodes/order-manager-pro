/**
 * Weight of one unit of an item, read from the end of its English (Zoho)
 * name: "<pack size><g|kg> x <packs>", e.g. "Berbere 250g x 40" is 40 packs
 * of 250 g = 10 kg per unit. Tolerates spacing, case, "×"/"*" for "x",
 * decimals ("1.5kg", "1,5kg") and gm/gms/gr/gram(s)/kgs/kilo(s); a closing
 * bracket after it is fine. Null when the name doesn't end that way.
 */
const PACK_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|kilograms?|g|gms?|grs?|grams?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*\)?\s*$/i;

const toNumber = (value: string) => Number(value.replace(",", "."));

export function unitWeightKgFromName(name: string | undefined): number | null {
  const match = PACK_PATTERN.exec(name ?? "");
  if (!match) return null;
  const [, size = "", unit = "", count = ""] = match;
  const packKg = unit.toLowerCase().startsWith("k") ? toNumber(size) : toNumber(size) / 1000;
  const kg = packKg * toNumber(count);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

/**
 * A line's weight in kilograms: one unit's weight (from the item's English
 * name) times the quantity, rounded to 3 decimals. Null when the name
 * doesn't carry the pack size, so the weight is left blank.
 */
export function lineWeightKg(itemName: string | undefined, quantity: number): number | null {
  const unitKg = unitWeightKgFromName(itemName);
  if (unitKg === null || !Number.isFinite(quantity)) return null;
  return Math.round(unitKg * quantity * 1000) / 1000;
}
