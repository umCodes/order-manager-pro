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

export type CustomerAddress = { city: string; district: string; street: string };

/** Joins the three address parts into the single string stored in Zoho's "address" custom field. */
export function formatAddress({ city, district, street }: CustomerAddress): string {
  return [city, district, street].map((part) => part.trim()).join(", ");
}

/** Splits a stored "city, district, street" string back into its parts. Missing parts come back as "". */
export function parseAddress(value: string | undefined): CustomerAddress {
  const [city = "", district = "", street = ""] = (value ?? "").split(",").map((part) => part.trim());
  return { city, district, street };
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
