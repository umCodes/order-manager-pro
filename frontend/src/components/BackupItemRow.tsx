import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import StockChips, { type StockChip } from "./StockChips";
import { inRowUnit, sentLabel, type MergedRow } from "../lib/backupLists";
import type { BreakdownLoading } from "../lib/shortages";

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One backup item, kept simple: its name and three icon chips, no words —
 * 📋 on the lists, 📦 what the preparers said is available, 🚚 what was
 * loaded (confirmed by the driver), the last two coloured by how they
 * compare. Tap it to see each list it's on, one line each, and tap a line
 * to confirm what was loaded of that list (or "All loaded" for every list).
 */
export default function BackupItemRow({
  row,
  loadings,
  onLoadingTap,
  onAllComplete,
}: {
  row: MergedRow;
  /** Each part's item on its list's Telegram message and what was confirmed loaded (same order as row.parts). */
  loadings: (BreakdownLoading | undefined)[];
  onLoadingTap?: (index: number) => void;
  onAllComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unit = row.unit;
  const onLists = round(row.parts.reduce((sum, part) => sum + inRowUnit(part.quantity, part.unit, unit), 0));
  const reported = row.parts.filter((part) => part.available !== null);
  const available = reported.length ? round(reported.reduce((sum, part) => sum + inRowUnit(part.available ?? 0, part.unit, unit), 0)) : null;
  const notReported = round(row.parts.filter((part) => part.available === null).reduce((sum, part) => sum + inRowUnit(part.quantity, part.unit, unit), 0));
  const confirmed = row.parts.map((part, i) => ({ part, loading: loadings[i] })).filter(({ loading }) => loading?.loaded);
  const loaded = confirmed.length ? round(confirmed.reduce((sum, { part, loading }) => sum + inRowUnit(loading!.loaded!.received, part.unit, unit), 0)) : null;
  const loadable = loadings.filter((entry): entry is BreakdownLoading => !!entry);
  const allLoaded = loadable.length > 0 && loadable.every((entry) => entry.loaded && entry.loaded.received >= entry.item.ordered);
  const chips: StockChip[] = [
    { kind: "lists", value: onLists, unit },
    ...(available !== null ? [{ kind: "ready" as const, value: available, of: onLists - notReported, unit }] : []),
    ...(loaded !== null ? [{ kind: "truck" as const, value: loaded, of: onLists, unit }] : []),
  ];

  return (
    <div className={`backup-item${open ? " backup-item--open" : ""}`}>
      <button type="button" className="backup-item__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="backup-item__names">
          <span className="backup-item__name">{row.name}</span>
          {row.description && <span className="backup-item__desc">{row.description}</span>}
          <StockChips chips={chips} />
        </span>
        <ChevronDown size={18} className={`backup-item__chevron${open ? " backup-item__chevron--open" : ""}`} />
      </button>

      {open && (
        <div className="backup-item__lists">
          {onAllComplete && loadable.length > 0 && (
            <button type="button" className="item-breakdown__all" disabled={allLoaded} onClick={onAllComplete}>
              <Check size={13} strokeWidth={3} />
              {allLoaded ? "All loaded" : "All loaded in full"}
            </button>
          )}
          {row.parts.map((part, index) => {
            const loading = loadings[index];
            const got = loading?.loaded ? loading.loaded.received : null;
            const state = got === null ? "pending" : got >= part.quantity ? "complete" : got > 0 ? "partial" : "missing";
            const content = (
              <>
                <span className={`item-loading-dot item-loading-dot--${state}`} aria-hidden="true">
                  {state === "complete" && <Check size={10} strokeWidth={3.5} />}
                </span>
                <span className="backup-list-line__main">
                  <span className="backup-list-line__title">
                    {sentLabel(part.created_at)}
                    {loading?.pending && <span className="item-loading-unsent" title="Not sent to Telegram yet" />}
                  </span>
                  <span className="backup-list-line__id">{part.list_id}</span>
                  <StockChips
                    chips={[
                      { kind: "lists", value: part.quantity, unit: part.unit },
                      ...(part.available !== null ? [{ kind: "ready" as const, value: part.available, of: part.quantity, unit: part.unit }] : []),
                      ...(got !== null ? [{ kind: "truck" as const, value: got, of: part.quantity, unit: part.unit }] : []),
                    ]}
                  />
                </span>
                {loading && onLoadingTap && <ChevronRight size={15} className="item-breakdown__chevron" />}
              </>
            );
            return loading && onLoadingTap ? (
              <button key={`${part.list_id}:${index}`} type="button" className={`backup-list-line backup-list-line--${state}`} onClick={() => onLoadingTap(index)}>
                {content}
              </button>
            ) : (
              <div key={`${part.list_id}:${index}`} className="backup-list-line">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
