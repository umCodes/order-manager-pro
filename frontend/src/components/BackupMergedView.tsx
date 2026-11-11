import DayGroupHeader from "./DayGroupHeader";
import { mergeBackupLists, sentLabel, type MergedRow } from "../lib/backupLists";
import { groupByScheduledDay } from "../lib/scheduledDate";
import type { BackupList } from "../types";

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
            <div className="line-items day-group__line-items">
              {rows.map((row) => (
                <div key={row.key} className="line-item">
                  <div className="line-item__main">
                    <div className="line-item__name">
                      <span className="line-item__name-text">{row.name}</span>
                    </div>
                    {row.description && <div className="line-item__meta">{row.description}</div>}
                    <div className="backup-badges">
                      <AvailabilityBadges row={row} />
                    </div>
                    {row.parts.length > 1 && (
                      <div className="line-item__meta backup-taken">
                        {row.parts.map((part) => `${part.remaining} ${part.unit} · ${sentLabel(part.created_at)}`).join("  |  ")}
                      </div>
                    )}
                  </div>
                  <div className="line-item__right">
                    <span className={`line-item__total${row.remaining === 0 ? " backup-used-up" : ""}`}>
                      {row.remaining} {row.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
