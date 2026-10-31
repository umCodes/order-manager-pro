import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteBackupList } from "../lib/api";
import ConfirmModal from "./ConfirmModal";
import ShortageBadge from "./ShortageBadge";
import type { BackupList } from "../types";

/** "27 Oct, 3:45 PM" in business time (UTC+3), whatever the device's time zone. */
function sentLabel(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Etc/GMT-3",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * The Items tab's backup lists: items sent to Telegram without an invoice,
 * each under its BK- id, kept apart from the drafts' items so nothing is
 * counted twice. An item reported short in the Telegram group shows what's
 * actually available, with how much is short. A list can be removed once
 * it's done with.
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
            <span className="category-group__label">{list.id}</span>
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
                </div>
                <div className="line-item__right">
                  <span className="line-item__total">
                    {item.available ?? item.quantity} {item.unit}
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
