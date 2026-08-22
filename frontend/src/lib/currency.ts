/** Formats an amount as a SAR-prefixed currency string, e.g. `currency(12.5)` → "SAR 12.50". */
export function currency(amount: number): string {
  return `SAR ${amount.toFixed(2)}`;
}
