import { useState } from "react";
import { Check, ChevronDown, ChevronRight, ClipboardList, PackageCheck, Truck } from "lucide-react";
import { inRowUnit, sentLabel, type MergedRow } from "../lib/backupLists";
import type { BreakdownLoading } from "../lib/shortages";

const round = (value: number) => Math.round(value * 1000) / 1000;

/** green when all of it, amber when part, red when none, grey when unknown. */
function tone(value: number | null, of: number) {
  if (value === null) return "unknown";
  return value >= of ? "full" : value > 0 ? "part" : "none";
}

function Stat({ icon, label, value, unit, toneName, note }: { icon: React.ReactNode; label: string; value: string; unit: string; toneName: string; note?: string }) {
  return (
    <div className={`backup-stat backup-stat--${toneName}`}>
      <div className="backup-stat__label">
        {icon}
        {label}
      </div>
      <div className="backup-stat__value">
        {value} <span className="backup-stat__unit">{unit}</span>
      </div>
      {note && <div className="backup-stat__note">{note}</div>}
    </div>
  );
}

/**
 * One backup item, kept simple: its name, then three numbers side by side —
 * how much is on the lists, how much the preparers said is available, and
 * how much was loaded (confirmed by the driver) — each coloured by how it
 * compares. Tap it to see each list it's on, one line each, and tap a line
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
  const taken = round(row.parts.reduce((sum, part) => sum + inRowUnit(part.taken, part.unit, unit), 0));

  return (
    <div className={`backup-item${open ? " backup-item--open" : ""}`}>
      <button type="button" className="backup-item__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="backup-item__names">
          <span className="backup-item__name">{row.name}</span>
          {row.description && <span className="backup-item__desc">{row.description}</span>}
        </span>
        <ChevronDown size={18} className={`backup-item__chevron${open ? " backup-item__chevron--open" : ""}`} />
      </button>

      <div className="backup-item__stats">
        <Stat icon={<ClipboardList size={13} />} label="On lists" value={String(onLists)} unit={unit} toneName="plain" note={taken > 0 ? `${taken} used by quick invoices` : undefined} />
        <Stat
          icon={<PackageCheck size={13} />}
          label="Available"
          value={available === null ? "—" : String(available)}
          unit={available === null ? "" : unit}
          toneName={available === null ? "unknown" : tone(available, onLists - notReported)}
          note={notReported > 0 ? `${notReported} not reported` : undefined}
        />
        <Stat
          icon={<Truck size={13} />}
          label="Loaded"
          value={loaded === null ? "—" : String(loaded)}
          unit={loaded === null ? "" : unit}
          toneName={loaded === null ? "unknown" : tone(loaded, onLists)}
          note={loadable.length > 0 ? `${confirmed.length}/${loadable.length} lists checked` : undefined}
        />
      </div>

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
                </span>
                <span className="backup-list-line__numbers">
                  <span>
                    {part.quantity} {part.unit}
                  </span>
                  <span className="backup-list-line__small">
                    avail. {part.available === null ? "—" : part.available} · loaded {got === null ? "—" : got}
                  </span>
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
