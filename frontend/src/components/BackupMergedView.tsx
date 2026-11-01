import { mergeBackupLists, sentLabel } from "../lib/backupLists";
import type { BackupList } from "../types";

/**
 * The Backups tab's Merged view: all backup lists as one list (see
 * mergeBackupLists). An item reported short shows what was reported
 * available out of what the lists had: "Short 5 kg · 15/20 kg", or
 * "Missing 20 kg" when none was.
 */
export default function BackupMergedView({ lists }: { lists: BackupList[] }) {
  const rows = mergeBackupLists(lists);
  if (rows.length === 0) {
    return (
      <div className="line-items">
        <div className="items-area__empty">No backup items</div>
      </div>
    );
  }
  return (
    <div className="line-items day-group__line-items">
      {rows.map((row) => (
        <div key={row.key} className="line-item">
          <div className="line-item__main">
            <div className="line-item__name">
              <span className="line-item__name-text">{row.name}</span>
            </div>
            {row.description && <div className="line-item__meta">{row.description}</div>}
            {row.short > 0 && (
              <span className={`shortage-badge shortage-note--${row.reported === 0 ? "missing" : "partial"}`}>
                {row.reported === 0
                  ? `Missing ${row.listed} ${row.unit}`
                  : `Short ${row.short} ${row.unit} · ${row.reported}/${row.listed} ${row.unit}`}
              </span>
            )}
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
  );
}
