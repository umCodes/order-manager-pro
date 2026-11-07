import { toAmharicUnit, toArabicUnit, toEnglishUnit } from "../utils/units.js";
import { linePacks, lineWeightKg } from "../utils/packWeight.js";
import type { InvoiceLanguage, InvoiceLineItem } from "./types.js";

/**
 * Amharic invoices show the line's own description; Arabic ones the item's
 * Arabic (Zoho secondary-language) name, falling back to the English name
 * when it has none; English ones the catalog item name.
 */
export function itemDisplayName(item: InvoiceLineItem, language: InvoiceLanguage): string {
  if (language === "am") return item.description;
  if (language === "ar") return item.arabicName || item.itemName;
  return item.itemName;
}

/** Translates a Zoho unit code ("kg", "box", …) into the invoice's language. */
export function translateUnit(unit: string, language: InvoiceLanguage): string {
  if (language === "am") return toAmharicUnit(unit);
  if (language === "ar") return toArabicUnit(unit);
  return toEnglishUnit(unit);
}

const KG_SUFFIX: Record<InvoiceLanguage, string> = { am: "ኪሎ", ar: "كغ", en: "kg" };

/**
 * The weight column's text, always in kilograms: one unit's weight read from
 * the item's English name ("… 250g x 40" = 10 kg) times the quantity — so
 * 0.5 of it is 5 kg. Empty when the name doesn't end in that pack format.
 * (The Telegram message keeps its own quantityCalc wording.)
 */
export function weightQtyText(item: InvoiceLineItem, language: InvoiceLanguage): string {
  const kg = lineWeightKg(item.itemName, item.quantity);
  return kg === null ? "" : `${kg}${KG_SUFFIX[language]}`;
}

/** The packs column's text: the line's quantity in packs (see linePacks), or empty when the name has no pack count. */
export function packsText(item: InvoiceLineItem): string {
  const packs = linePacks(item.itemName, item.quantity);
  return packs === null ? "" : String(packs);
}
