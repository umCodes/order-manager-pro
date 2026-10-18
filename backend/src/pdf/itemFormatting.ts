import { toAmharicUnit, toArabicUnit, toEnglishUnit } from "../utils/units.js";
import { lineWeightKg } from "../utils/packWeight.js";
import type { InvoiceLanguage, InvoiceLineItem } from "./types.js";

/** Amharic invoices show the line's own description; other languages show the catalog item name. */
export function itemDisplayName(item: InvoiceLineItem, language: InvoiceLanguage): string {
  return language === "am" ? item.description : item.itemName;
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
