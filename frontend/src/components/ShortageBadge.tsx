const amount = (value: number, unit: string) => `${Math.round(value * 1000) / 1000} ${unit}`.trim();

/**
 * How much is short, as one small badge: red "Missing 5 kg" when none of
 * `ordered` is available, amber "Short 0.5 box" otherwise, in the item's own unit.
 */
export default function ShortageBadge({
  short,
  ordered,
  unit,
}: {
  short: number;
  ordered: number;
  unit: string;
}) {
  const missing = short >= ordered;
  return (
    <span className={`shortage-badge shortage-note--${missing ? "missing" : "partial"}`}>
      {missing ? "Missing" : "Short"} {amount(short, unit)}
    </span>
  );
}
