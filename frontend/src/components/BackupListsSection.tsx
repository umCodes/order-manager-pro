import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteBackupList } from "../lib/api";
import ConfirmModal from "./ConfirmModal";
import PreparationBadge from "./PreparationBadge";
import { sentLabel } from "../lib/backupLists";
import ShortageBadge from "./ShortageBadge";
import type { BackupList } from "../types";

/**
 * The Backups tab's Grouped view: one block per backup list (items sent to
 * Telegram without an invoice), each under its BK- id, kept apart from the drafts' items so nothing is
 * counted twice. Each item shows what's left: what was reported available
 * in the Telegram group (with how much is short), less what quick invoices
 * (sent within 15 minutes of being created) took from it, with which ones.
 * Each list shows its status in the Telegram group (seen to once anyone
 * replies or reacts). A list can be removed once it's done with.
 */
export default function BackupListsSection({ lists, onRemoved }: { lists: BackupList[]; onRemoved: () => void }) {
  const [removing, setRemoving] = useState<BackupList | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lists.length === 0) return null;

  async function confirmRemove() {
    if (!removing) return;
    setIsRemoving(true);
    setError(null);
    try {
      await deleteBackupList(removing.id);
      setRemoving(null);
      onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove backup list");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <section className="day-group">
      <div className="day-group__header">
        <div className="day-group__title">
          <span className="day-group__label">Backup lists</span>
        </div>
        <div className="day-group__meta">
          <span className="day-group__count">
            {lists.length} list{lists.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {lists.map((list) => (
        <div key={list.id} className="category-group">
          <div className="category-group__header">
            <span className="category-group__label">
              {list.id} {list.status && <PreparationBadge status={list.status} confirmed={list.confirmed} />}
            </span>
            <span className="category-group__meta">
              <span className="category-group__count">{sentLabel(list.created_at)}</span>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Remove ${list.id}`}
                title="Remove backup list"
                onClick={() => {
                  setError(null);
                  setRemoving(list);
                }}
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
          <div className="line-items day-group__line-items">
            {list.items.map((item) => (
              <div key={`${item.number}|${item.item_id}`} className="line-item">
                <div className="line-item__main">
                  <div className="line-item__name">
                    <span className="line-item__name-text">
                      {item.number}. {item.name || item.description}
                    </span>
                  </div>
                  {item.name && item.description && item.description !== item.name && (
                    <div className="line-item__meta">{item.description}</div>
                  )}
                  {item.short !== undefined && item.short > 0 && (
                    <ShortageBadge short={item.short} ordered={item.quantity} unit={item.unit} />
                  )}
                  {item.taken_by?.map((use, index) => (
                    <div key={`${use.invoice_number}:${index}`} className="line-item__meta backup-taken">
                      −{use.quantity} {item.unit} · {use.invoice_number} · {use.customer_name}
                    </div>
                  ))}
                </div>
                <div className="line-item__right">
                  <span className={`line-item__total${item.remaining === 0 ? " backup-used-up" : ""}`}>
                    {item.remaining ?? item.available ?? item.quantity} {item.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {removing && (
        <ConfirmModal
          title={`Remove ${removing.id}?`}
          message="The list leaves the app and its Telegram message is deleted (if it's under 48 hours old)."
          confirmLabel="Remove"
          error={error}
          isConfirming={isRemoving}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
