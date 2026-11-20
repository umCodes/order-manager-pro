import { PackageCheck, ShoppingCart } from "lucide-react";

export type StockChip = {
  kind: "ready" | "sold";
  value: number;
  unit: string;
  /** Out of how much (an order's quantity): colours a "ready" chip green / amber / red. Without it, plain. */
  of?: number;
};

const WORD = { ready: "Ready", sold: "Sold" } as const;
const LABEL = { ready: "Reported ready by the preparers in Telegram", sold: "Sold from backup stock (quick invoices)" } as const;

/**
 * Small chips, an icon and one word: "Ready" — what the preparers reported
 * available in the Telegram group (green when all of it, amber when part,
 * red when none, when there's an amount to compare with) — and "Sold" — how
 * much of a backup item quick invoices took. The full meaning is in the tooltip.
 */
export default function StockChips({ chips }: { chips: StockChip[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="stock-chips">
      {chips.map((chip) => {
        const tone = chip.kind === "sold" ? "sold" : chip.of === undefined ? "plain" : chip.value >= chip.of ? "full" : chip.value > 0 ? "part" : "none";
        const amount = `${Math.round(chip.value * 1000) / 1000}${chip.of !== undefined ? `/${chip.of}` : ""} ${chip.unit}`.trim();
        return (
          <span key={chip.kind} className={`stock-chip stock-chip--${tone}`} title={`${LABEL[chip.kind]}: ${amount}`}>
            {chip.kind === "ready" ? <PackageCheck size={12} /> : <ShoppingCart size={12} />}
            {WORD[chip.kind]} {amount}
          </span>
        );
      })}
    </span>
  );
}
