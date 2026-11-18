import DayGroupHeader from "./DayGroupHeader";
import BackupItemRow from "./BackupItemRow";
import { mergeBackupLists } from "../lib/backupLists";
import { groupByScheduledDay } from "../lib/scheduledDate";
import type { BackupList } from "../types";

/**
 * The Backups tab's Merged view: all backup lists as one list, a section per
 * day they're wanted for (past days counted under today, as on the Invoice
 * items tab), the same item in one row (see mergeBackupLists) as a simple
 * card (see BackupItemRow): on the lists and available, as icon chips; a
 * card opens to the lists it's on.
 */
export default function BackupMergedView({ lists }: { lists: BackupList[] }) {
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
              {rows.map((row) => (
                <BackupItemRow key={`${group.date ?? ""}|${row.key}`} row={row} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
