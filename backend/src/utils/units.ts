// Zoho Books' default unit list (Settings > Items > Units), with Arabic and
// Amharic translations for invoice rendering.
export type UnitCode =
  | "pcs"
  | "pack"
  | "box"
  | "dz"
  | "pair"
  | "kg"
  | "g"
  | "mg"
  | "lb"
  | "oz"
  | "ton"
  | "in"
  | "ft"
  | "cm"
  | "mm"
  | "m"
  | "km"
  | "ml"
  | "l"
  | "gal"
  | "qt"
  | "sqft"
  | "sqm"
  | "hrs"
  | "days";

type UnitTranslation = {
  en: string;
  ar: string;
  am: string;
};

export const UNIT_TRANSLATIONS: Record<UnitCode, UnitTranslation> = {
  pcs: { en: "pcs", ar: "قطعة", am: "ቁራጭ" },
  pack: { en: "pack", ar: "وحدة", am: "እሽግ" },
  box: { en: "box", ar: "كرتون", am: "ካርቶን" },
  dz: { en: "dz", ar: "دزينة", am: "ደርዘን" },
  pair: { en: "pair", ar: "زوج", am: "ጥንድ" },
  kg: { en: "kg", ar: "كجم", am: "ኪ.ግ" },
  g: { en: "g", ar: "جم", am: "ግ" },
  mg: { en: "mg", ar: "ملجم", am: "ሚ.ግ" },
  lb: { en: "lb", ar: "رطل", am: "ፓውንድ" },
  oz: { en: "oz", ar: "أونصة", am: "አውንስ" },
  ton: { en: "ton", ar: "طن", am: "ቶን" },
  in: { en: "in", ar: "بوصة", am: "ኢንች" },
  ft: { en: "ft", ar: "قدم", am: "ጫማ" },
  cm: { en: "cm", ar: "سم", am: "ሴ.ሜ" },
  mm: { en: "mm", ar: "مم", am: "ሚ.ሜ" },
  m: { en: "m", ar: "متر", am: "ሜትር" },
  km: { en: "km", ar: "كم", am: "ኪ.ሜ" },
  ml: { en: "ml", ar: "مل", am: "ሚ.ሊ" },
  l: { en: "l", ar: "لتر", am: "ሊትር" },
  gal: { en: "gal", ar: "جالون", am: "ጋሎን" },
  qt: { en: "qt", ar: "كوارت", am: "ኳርት" },
  sqft: { en: "sqft", ar: "قدم مربع", am: "ካሬ ጫማ" },
  sqm: { en: "sqm", ar: "متر مربع", am: "ካሬ ሜትር" },
  hrs: { en: "hrs", ar: "ساعة", am: "ሰዓት" },
  days: { en: "days", ar: "يوم", am: "ቀን" },
};

export function toArabicUnit(unit: string): string {
  const match = UNIT_TRANSLATIONS[unit.toLowerCase() as UnitCode];
  return match?.ar ?? unit;
}

export function toAmharicUnit(unit: string): string {
  const match = UNIT_TRANSLATIONS[unit.toLowerCase() as UnitCode];
  return match?.am ?? unit;
}

export function toEnglishUnit(unit: string): string {
  const match = UNIT_TRANSLATIONS[unit.toLowerCase() as UnitCode];
  return match?.en ?? unit;
}
