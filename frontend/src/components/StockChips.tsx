import { ClipboardList, PackageCheck } from "lucide-react";

export type StockChip = {
  kind: "ready" | "lists";
  value: number;
  unit: string;
  /** Out of how much (an invoice line's quantity): colours the chip green / amber / red. Without it, plain. */
  of?: number;
};

const LABEL = { ready: "Reported available by the preparers", lists: "On the backup lists" } as const;

/**
 * Small icon chips, no words: 📦 what the preparers reported available in the
 * Telegram group (📋 how much is on the backup lists) — each with its amount,
 * green when all of it, amber when part, red when none (when there's an
 * amount to compare with).
 * The words are in the tooltip.
 */
export default function StockChips({ chips }: { chips: StockChip[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="stock-chips">
      {chips.map((chip) => {
        const tone = chip.of === undefined ? "plain" : chip.value >= chip.of ? "full" : chip.value > 0 ? "part" : "none";
        const text = `${Math.round(chip.value * 1000) / 1000}${chip.of !== undefined ? `/${chip.of}` : ""} ${chip.unit}`.trim();
        return (
          <span key={chip.kind} className={`stock-chip stock-chip--${tone}`} title={`${LABEL[chip.kind]}: ${text}`} aria-label={`${LABEL[chip.kind]}: ${text}`}>
            {chip.kind === "ready" ? <PackageCheck size={12} /> : <ClipboardList size={12} />}
            {text}
          </span>
        );
      })}
    </span>
  );
}
