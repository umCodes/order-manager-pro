import { useState } from "react";
import DayGroupHeader from "./DayGroupHeader";
import ItemBreakdownRow from "./ItemBreakdownRow";
import { mergeBackupLists, sentLabel, type MergedRow } from "../lib/backupLists";
import { groupByScheduledDay } from "../lib/scheduledDate";
import type { BreakdownLoading } from "../lib/shortages";
import type { BackupList, DraftItemBreakdownEntry, DraftLineItemSummary } from "../types";

/** A merged row as an Items-tab item: its lists as the breakdown (each list's own quantity), to confirm loading per list. */
function asItem(row: MergedRow): DraftLineItemSummary {
  const breakdown: DraftItemBreakdownEntry[] = row.parts.map((part) => ({
    invoice_id: part.list_id,
    invoice_number: part.list_id,
    customer_name: sentLabel(part.created_at),
    date: part.date ?? "",
    quantity: part.quantity,
    unit: part.unit,
    item_id: part.item_id,
    description: part.description,
  }));
  return { name: row.name, description: row.description, quantity: row.remaining, unit: row.unit, category: null, breakdown };
}

type LoadingProps = {
  /** Each list's item and what was confirmed loaded of it (as the Items tab works it out). */
  loadingsFor?: (entries: DraftItemBreakdownEntry[]) => (BreakdownLoading | undefined)[];
  onLoadingTap?: (loading: BreakdownLoading, name: string, source: string) => void;
  onAllComplete?: (loadings: BreakdownLoading[]) => void;
};

/**
 * What the preparers said about a merged item: on the lists they've seen to,
 * "Available 25/30 kg" — green when all of it, amber when part, red when
 * none — and, for lists nobody has seen to yet, a grey "Not reported 10 kg".
 */
function AvailabilityBadges({ row }: { row: MergedRow }) {
  const tone = row.available >= row.needed ? "ready" : row.available === 0 ? "missing" : "partial";
  return (
    <>
      {row.needed > 0 && (
        <span className={`shortage-badge preparation-badge--${tone}`}>
          Available {row.available}/{row.needed} {row.unit}
        </span>
      )}
      {row.not_reported > 0 && (
        <span className="shortage-badge preparation-badge--not_reported">
          Not reported {row.not_reported} {row.unit}
        </span>
      )}
    </>
  );
}

/**
 * The Backups tab's Merged view: all backup lists as one list, a section per
 * day they're wanted for (past days counted under today, as on the Invoice
 * items tab), the same item in one row (see mergeBackupLists) with what's
 * left on the right and what the preparers reported available under it.
 * Like the Invoice items tab, a row opens to the lists it's on: tap one to
 * confirm what was loaded of it, or "All complete" for every list at once.
 */
export default function BackupMergedView({ lists, loadingsFor, onLoadingTap, onAllComplete }: { lists: BackupList[] } & LoadingProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  if (lists.length === 0) {
    return (
      <div className="line-items">
        <div className="items-area__empty">No backup items</div>
      </div>
    );
  }
  return (
    <>
      {groupByScheduledDay(lists, (list) => list.date).map((group) => {
        const rows = mergeBackupLists(group.entries.map(({ value }) => value));
        return (
          <section key={group.date ?? "unscheduled"} className="day-group">
            <DayGroupHeader
              date={group.date}
              count={rows.length}
              noun="item"
              carriedOverCount={group.entries.filter((entry) => entry.isCarriedOver).length}
            />
            <div className="line-items day-group__line-items">
              {rows.map((row) => {
                const item = asItem(row);
                const rowKey = `${group.date ?? ""}|${row.key}`;
                const loadings = loadingsFor?.(item.breakdown) ?? [];
                return (
                  <ItemBreakdownRow
                    key={rowKey}
                    item={item}
                    isChecked={checked.has(rowKey)}
                    isExpanded={expanded.has(rowKey)}
                    onToggleChecked={() => setChecked((current) => toggle(current, rowKey))}
                    onToggleExpanded={() => setExpanded((current) => toggle(current, rowKey))}
                    loadings={loadings}
                    onLoadingTap={
                      onLoadingTap
                        ? (index) => {
                            const loading = loadings[index];
                            const entry = item.breakdown[index];
                            if (loading && entry) onLoadingTap(loading, row.name, `${entry.invoice_number} · ${entry.customer_name}`);
                          }
                        : undefined
                    }
                    onAllComplete={
                      onAllComplete ? () => onAllComplete(loadings.filter((entry): entry is BreakdownLoading => !!entry)) : undefined
                    }
                    extra={
                      <div className="backup-badges">
                        <AvailabilityBadges row={row} />
                      </div>
                    }
                    quantityLabel={
                      <span className={row.remaining === 0 ? "backup-used-up" : undefined}>
                        {row.remaining} {row.unit}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
