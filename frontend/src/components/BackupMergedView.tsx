import DayGroupHeader from "./DayGroupHeader";
import BackupItemRow from "./BackupItemRow";
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
 * The Backups tab's Merged view: all backup lists as one list, a section per
 * day they're wanted for (past days counted under today, as on the Invoice
 * items tab), the same item in one row (see mergeBackupLists) with what's
 * a simple card (see BackupItemRow): on the lists, available, loaded. Like
 * the Invoice items tab, a card opens to the lists it's on: tap one to
 * confirm what was loaded of it, or load every list in full at once.
 */
export default function BackupMergedView({ lists, loadingsFor, onLoadingTap, onAllComplete }: { lists: BackupList[] } & LoadingProps) {
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
            <div className="backup-items">
              {rows.map((row) => {
                const item = asItem(row);
                const loadings = loadingsFor?.(item.breakdown) ?? [];
                return (
                  <BackupItemRow
                    key={`${group.date ?? ""}|${row.key}`}
                    row={row}
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
