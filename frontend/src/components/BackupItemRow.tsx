import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { inRowUnit, sentLabel, type MergedRow } from "../lib/backupLists";
import StockChips, { type StockChip } from "./StockChips";

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One backup item: its name, how much is on the backup lists (right), and
 * two chips — "Ready" (what the preparers reported available in Telegram)
 * and "Sold" (what quick invoices took from it). Tap it to see each list it's
 * on, with the same chips and who each sale went to.
 */
export default function BackupItemRow({ row }: { row: MergedRow }) {
  const [open, setOpen] = useState(false);
  const unit = row.unit;
  const onLists = round(row.parts.reduce((sum, part) => sum + inRowUnit(part.quantity, part.unit, unit), 0));
  const reported = row.parts.filter((part) => part.available !== null);
  const available = reported.length ? round(reported.reduce((sum, part) => sum + inRowUnit(part.available ?? 0, part.unit, unit), 0)) : null;
  const reportedOf = round(reported.reduce((sum, part) => sum + inRowUnit(part.quantity, part.unit, unit), 0));
  const sold = round(row.parts.reduce((sum, part) => sum + inRowUnit(part.taken, part.unit, unit), 0));
  const chips: StockChip[] = [
    ...(available !== null ? [{ kind: "ready" as const, value: available, of: reportedOf, unit }] : []),
    ...(sold > 0 ? [{ kind: "sold" as const, value: sold, unit }] : []),
  ];

  return (
    <div className={`backup-item${open ? " backup-item--open" : ""}`}>
      <button type="button" className="backup-item__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="backup-item__names">
          <span className="backup-item__name">{row.name}</span>
          {row.description && <span className="backup-item__desc">{row.description}</span>}
          <StockChips chips={chips} />
        </span>
        <span className="backup-item__side">
          <span className="backup-item__total">
            {onLists} {unit}
          </span>
          <ChevronDown size={18} className={`backup-item__chevron${open ? " backup-item__chevron--open" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="backup-item__lists">
          {row.parts.map((part, index) => (
            <div key={`${part.list_id}:${index}`} className="backup-list-line">
              <span className="backup-list-line__main">
                <span className="backup-list-line__title">{sentLabel(part.created_at)}</span>
                <span className="backup-list-line__id">{part.list_id}</span>
                <StockChips
                  chips={[
                    ...(part.available !== null ? [{ kind: "ready" as const, value: part.available, of: part.quantity, unit: part.unit }] : []),
                    ...(part.taken > 0 ? [{ kind: "sold" as const, value: part.taken, unit: part.unit }] : []),
                  ]}
                />
                {part.taken_by.map((sale, i) => (
                  <span key={`${sale.invoice_number}:${i}`} className="backup-sale">
                    {sale.customer_name} · {sale.invoice_number} · {sale.quantity} {part.unit}
                  </span>
                ))}
              </span>
              <span className="backup-list-line__qty">
                {part.quantity} {part.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
