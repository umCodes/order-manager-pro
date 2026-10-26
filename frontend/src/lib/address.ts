import type { Contact } from "../types";

/**
 * Saudi cities offered in the "City" dropdown, Riyadh first since that's
 * where the overwhelming majority of customers are.
 */
export const SAUDI_CITIES: string[] = [
  "Riyadh",
  "Jeddah",
  "Mecca",
  "Medina",
  "Dammam",
  "Khobar",
  "Dhahran",
  "Taif",
  "Tabuk",
  "Buraidah",
  "Unaizah",
  "Hail",
  "Khamis Mushait",
  "Abha",
  "Najran",
  "Jubail",
  "Yanbu",
  "Al Kharj",
  "Qatif",
  "Al Hofuf",
  "Jazan",
  "Arar",
  "Sakaka",
  "Bisha",
  "Al Bahah",
];

/**
 * Standard/known Riyadh districts offered as suggestions in the "District"
 * field. The field also accepts free typing (via <datalist>), so this list
 * doesn't need to be exhaustive — it's a starting point re-ranked at render
 * time by how many existing customers are already in each district (see
 * buildDistrictOptions).
 */
export const RIYADH_DISTRICTS: string[] = [
  "Al Olaya",
  "Al Malaz",
  "Al Naseem",
  "Al Sulimaniyah",
  "Al Wurud",
  "Al Rawdah",
  "King Fahd",
  "Al Nakheel",
  "Al Muruj",
  "Al Yasmin",
  "Al Narjis",
  "Al Rabwah",
  "Al Sahafah",
  "Hittin",
  "Al Aqiq",
  "Al Ghadeer",
  "Diriyah",
  "Irqah",
  "Al Rahmaniyah",
  "Al Rimal",
  "Al Falah",
  "Al Wadi",
  "Al Andalus",
  "Al Qadisiyah",
  "Al Salam",
  "Al Shifa",
  "Al Fayha",
  "Al Manar",
  "Al Taawun",
  "Al Wizarat",
  "As Sulay",
  "Al Dar Al Baida",
  "Al Hamra",
  "Al Jazirah",
  "Al Khalidiyah",
  "Al Mansuriyah",
  "Al Marwah",
  "Al Munsiyah",
  "Al Nuzhah",
  "Al Qirawan",
  "Al Rayyan",
  "Al Shuhada",
  "Al Uraija",
  "Ad Dar Al Bayda",
  "Ash Shifa",
  "Badr",
  "Laban",
  "Manfuhah",
  "Namar",
  "Okaz",
  "Qurtubah",
  "Salah Ad Din",
  "Tuwaiq",
  "Uraidh",
  "Utaiqah",
];

export type CustomerAddress = { city: string; district: string; street: string; locationLink: string };

/**
 * Joins the address parts into the single string stored in Zoho's "address"
 * custom field: "city, district, street" plus, when set, a 4th part with the
 * Google Maps link. The link is appended whole (never split), so it's free
 * to contain its own commas (e.g. coordinate query params) — see
 * parseAddress for the matching reconstruction.
 */
export function formatAddress({ city, district, street, locationLink }: CustomerAddress): string {
  const parts = [city, district, street].map((part) => part.trim());
  if (locationLink.trim()) parts.push(locationLink.trim());
  return parts.join(", ");
}

/**
 * Splits a stored "city, district, street[, locationLink]" string back into
 * its parts. Missing parts come back as "". Only the first three commas are
 * treated as separators — everything after them is rejoined as
 * locationLink, so a Google Maps link containing its own commas round-trips
 * intact instead of being chopped up.
 */
export function parseAddress(value: string | undefined): CustomerAddress {
  const parts = (value ?? "").split(",").map((part) => part.trim());
  const [city = "", district = "", street = ""] = parts;
  const locationLink = parts.slice(3).join(",");
  return { city, district, street, locationLink };
}

/**
 * Builds the district suggestion list for the datalist, ranking every
 * district already used by an existing customer above the untouched
 * standard list, most customers first. Districts tied on customer count (or
 * not used at all) fall back to the standard list's order.
 */
export function buildDistrictOptions(customers: Contact[], getAddress: (c: Contact) => CustomerAddress | undefined): string[] {
  const counts = new Map<string, number>();
  for (const customer of customers) {
    const district = getAddress(customer)?.district;
    if (!district) continue;
    counts.set(district, (counts.get(district) ?? 0) + 1);
  }

  const allDistricts = new Set<string>([...RIYADH_DISTRICTS, ...counts.keys()]);
  return Array.from(allDistricts).sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (diff !== 0) return diff;
    return RIYADH_DISTRICTS.indexOf(a) - RIYADH_DISTRICTS.indexOf(b);
  });
}

/** Other spellings of the cities above (e.g. how OpenStreetMap names them). */
const CITY_ALIASES: Record<string, string> = {
  makkah: "Mecca",
  makkahalmukarramah: "Mecca",
  madinah: "Medina",
  almadinah: "Medina",
  almadinahalmunawwarah: "Medina",
  buraydah: "Buraidah",
  unayzah: "Unaizah",
  hufuf: "Al Hofuf",
  hofuf: "Al Hofuf",
  jizan: "Jazan",
  jazan: "Jazan",
  kharj: "Al Kharj",
  bahah: "Al Bahah",
  khobar: "Khobar",
  jubayl: "Jubail",
  qatif: "Qatif",
};

const cityKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/^al(?=[a-z]{3})/, "");

/** The city in SAUDI_CITIES that `name` refers to ("Makkah", "Al Khobar", "Ha'il" …), or null. */
export function matchSaudiCity(name: string): string | null {
  const key = cityKey(name);
  if (!key) return null;
  const direct = SAUDI_CITIES.find((city) => cityKey(city) === key);
  if (direct) return direct;
  return CITY_ALIASES[key] ?? CITY_ALIASES[name.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

/** A district name without the word "District" (or "Neighbourhood"), as map services add it. */
export function cleanDistrictName(name: string): string {
  return name
    .replace(/\b(district|neighbou?rhood|dist\.)(\s+of)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,\-–\s]+|[,\-–\s]+$/g, "");
}

/** Arabic articles as they're written in English ("Al", "An", "As" …), dropped before comparing. */
const ARTICLES = new Set(["al", "el", "an", "ar", "as", "ash", "ad", "adh", "at", "ath", "az"]);

/**
 * A district name reduced for comparison: lower case, no "District", no
 * leading article, no hyphens or apostrophes, and the usual spelling
 * variants merged (ee/i, oo/ou/u, doubled letters, a final h).
 */
function districtKey(name: string): string {
  const words = cleanDistrictName(name)
    .toLowerCase()
    .replace(/['’`ʿʾ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && ARTICLES.has(words[0]!)) words.shift();
  return words
    .join(" ")
    .replace(/ee/g, "i")
    .replace(/(oo|ou)/g, "u")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/q/g, "k")
    .replace(/h\b/g, "");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/**
 * The district from `options` (the District dropdown) most like `found`
 * (from a map service) — "An Nakheel District" → "Al Nakheel". When none
 * is close enough, `found` itself, without the word "District".
 */
export function matchDistrict(found: string, options: string[]): string {
  const cleaned = cleanDistrictName(found);
  const key = districtKey(cleaned);
  if (!key) return cleaned;
  const exact = options.find((option) => option.toLowerCase() === cleaned.toLowerCase());
  if (exact) return exact;
  let best: { option: string; score: number } | null = null;
  for (const option of options) {
    const optionKey = districtKey(option);
    if (!optionKey) continue;
    const score = optionKey === key ? 1 : 1 - editDistance(key, optionKey) / Math.max(key.length, optionKey.length);
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= 0.75 ? best.option : cleaned;
}
