import type { OrderShortageItem } from "../types";

const amount = (value: number, unit: OrderShortageItem["unit"]) => (unit === "pcs" ? `${Math.round(value * 1000) / 1000}` : `${Math.round(value * 1000) / 1000}kg`);

/**
 * How much is short, as one small badge: red "Missing 5kg" when none of
 * `ordered` is available, amber "Short 2kg" otherwise. Amounts are as the
 * Telegram messages count them (kg, or a count for a pack).
 */
export default function ShortageBadge({
  short,
  ordered,
  unit,
}: {
  short: number;
  ordered: number;
  unit: OrderShortageItem["unit"];
}) {
  const missing = short >= ordered;
  return (
    <span className={`shortage-badge shortage-note--${missing ? "missing" : "partial"}`}>
      {missing ? "Missing" : "Short"} {amount(short, unit)}
    </span>
  );
}
