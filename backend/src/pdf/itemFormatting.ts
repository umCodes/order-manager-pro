import { toAmharicUnit, toArabicUnit, toEnglishUnit } from "../utils/units.js";
import { quantityCalc, quantityCalcWithSuffix } from "../utils/quantity.js";
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

/** The weight column's text: the same box×10 / sub-kg→grams math, with language-appropriate kg/g suffixes. */
export function weightQtyText(item: InvoiceLineItem, language: InvoiceLanguage): string {
  if (language === "am") return `${quantityCalc(item.quantity, item.unit)}`;
  const kgSuffix = language === "ar" ? "كجم" : "kg";
  const gSuffix = language === "ar" ? "جم" : "g";
  return quantityCalcWithSuffix(item.quantity, item.unit, kgSuffix, gSuffix);
}
