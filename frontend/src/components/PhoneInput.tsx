import { useState } from "react";

/** Selectable dialing codes: Saudi Arabia first, then Ethiopia, then the other Gulf countries. */
const COUNTRY_CODES = [
  { code: "966", label: "SA +966", name: "Saudi Arabia" },
  { code: "251", label: "ET +251", name: "Ethiopia" },
  { code: "971", label: "AE +971", name: "United Arab Emirates" },
  { code: "965", label: "KW +965", name: "Kuwait" },
  { code: "974", label: "QA +974", name: "Qatar" },
  { code: "973", label: "BH +973", name: "Bahrain" },
  { code: "968", label: "OM +968", name: "Oman" },
] as const;

const DEFAULT_CODE = COUNTRY_CODES[0].code;

/**
 * Splits a stored phone into a known country code and the local part.
 * Numbers without a recognizable international prefix (e.g. "05...") fall
 * back to the default country with their digits kept as typed.
 */
function parsePhone(value: string): { code: string; local: string } {
  const trimmed = value.trim();
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "").replace(/^00/, "");
  if (international) {
    const match = COUNTRY_CODES.find((c) => digits.startsWith(c.code));
    if (match) return { code: match.code, local: digits.slice(match.code.length) };
  }
  return { code: DEFAULT_CODE, local: digits };
}

/** "+<code><local>", dropping the local trunk "0" (05x → 5x). Empty when no number was entered. */
function formatPhone(code: string, local: string): string {
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? `+${code}${digits}` : "";
}

type Props = {
  id?: string;
  value: string;
  /** Receives the full international number (e.g. "+966512345678"), or "" when empty. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * Phone field with a country-code picker, pre-filled with Saudi Arabia.
 * `onChange` only fires on user edits, so an untouched existing number is
 * passed back exactly as it was stored.
 */
export default function PhoneInput({ id, value, onChange, placeholder, disabled, autoFocus }: Props) {
  const [initial] = useState(() => parsePhone(value));
  const [code, setCode] = useState(initial.code);
  const [local, setLocal] = useState(initial.local);

  return (
    <div className="phone-input">
      <select
        className="input phone-input__code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          onChange(formatPhone(e.target.value, local));
        }}
        disabled={disabled}
        aria-label="Country code"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code} title={c.name}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        className="input phone-input__number"
        value={local}
        placeholder={placeholder ?? (code === "966" ? "5XXXXXXXX" : "Phone number")}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange(formatPhone(code, e.target.value));
        }}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </div>
  );
}
