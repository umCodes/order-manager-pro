import type { WhatsAppTemplate } from "./api";

/** Shared by the Templates screen and Settings: reading templates' variables and names. */

/** The distinct {{…}} placeholders in a template text, in order of first appearance. */
export function placeholdersIn(text: string | undefined): string[] {
  const found: string[] = [];
  for (const match of (text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

export function fill(text: string | undefined, values: Record<string, string> | undefined) {
  return (text ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key) => values?.[key]?.trim() || whole);
}

/** Language names for the prefix our template names start with (am_…, ar_…, en_…). */
const NAME_LANGUAGES: Record<string, string> = {
  am: "Amharic",
  ar: "Arabic",
  en: "English",
  fr: "French",
  om: "Oromo",
  ti: "Tigrinya",
  so: "Somali",
  sw: "Swahili",
  de: "German",
  es: "Spanish",
  it: "Italian",
  tr: "Turkish",
  zh: "Chinese",
};

/**
 * The language a name prefix stands for: its code exactly ("en"), or any
 * start of its name ("eng", "amh", "arabic"). Unknown prefixes aren't
 * treated as languages, so a name like "order_ready" keeps its first word.
 */
function languageOfPrefix(prefix: string): string | undefined {
  if (prefix in NAME_LANGUAGES) return NAME_LANGUAGES[prefix];
  if (prefix.length < 2) return undefined;
  return Object.values(NAME_LANGUAGES).find((language) => language.toLowerCase().startsWith(prefix));
}

/** Words shown in capitals in a template's title ("invoice_pdf" → "Invoice PDF"). */
const ACRONYMS = new Set(["pdf", "id", "sms", "url", "vat", "etb", "otp"]);

/**
 * A template's name for reading: by our naming convention the first part
 * is the language the text is written in (which can differ from the
 * language it's registered under), shown as a badge; the rest becomes the
 * title, words capitalised: "am_payment_confirmation" → "Payment
 * Confirmation" with an "Amharic" badge. Names without a language prefix
 * just get the title treatment.
 */
export function displayName(name: string): { title: string; language?: string } {
  const words = name.split("_").filter(Boolean);
  const language = words.length > 1 ? languageOfPrefix(words[0].toLowerCase()) : undefined;
  const titleWords = language ? words.slice(1) : words;
  return {
    title: titleWords.map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))).join(" ") || name,
    ...(language && { language }),
  };
}

export function part(template: WhatsAppTemplate, type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS") {
  return template.components.find((c) => c.type === type);
}

