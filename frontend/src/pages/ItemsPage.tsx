import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBackupLists, fetchDraftLineItems, fetchItemCategorySettings, fetchOrderLoadings, fetchPreparationStatuses, sendLoadingBatch } from "../lib/api";
import { loadingsForBreakdown, pendingKey, shortagesForBreakdown, type BreakdownLoading, type PendingLoading } from "../lib/shortages";
import ItemLoadingSheet from "../components/ItemLoadingSheet";
import { formatItemsForCopy, groupItemsByCategory, groupItemsByScheduledDay } from "../lib/itemSummary";
import { useSortState } from "../hooks/useSortState";
import SortRow from "../components/SortRow";
import ItemBreakdownRow from "../components/ItemBreakdownRow";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import DayGroupHeader from "../components/DayGroupHeader";
import BackupListsSection from "../components/BackupListsSection";
import BackupMergedView from "../components/BackupMergedView";
import BackupMissingSection from "../components/BackupMissingSection";
import type { BackupList, BackupMissingItem, DraftLineItemSummary, OrderLoadingView, OrderShortageItem } from "../types";

type SortKey = "name" | "quantity";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "quantity", label: "Quantity" },
];

/**
 * Aggregated view of every line item across all draft invoices, split into
 * one section per scheduled day (past-due drafts count toward today, as on
 * the Drafts tab), with a per-item source breakdown. Within a day, items are
 * grouped by their Zoho Inventory category, in the order set in Settings.
 * Backup lists (items sent without an invoice) have a tab of their own, as
 * one merged list or one block per list.
 */
export default function ItemsPage() {
  const [items, setItems] = useState<DraftLineItemSummary[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [backupLists, setBackupLists] = useState<{ lists: BackupList[]; missing: BackupMissingItem[] }>({ lists: [], missing: [] });
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("quantity", "desc");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // Invoice items or backups, and for the backups all lists merged into one or one block per list.
  const [tab, setTab] = useState<"invoices" | "backups">("invoices");
  const [backupView, setBackupView] = useState<"merged" | "grouped">("merged");
  // Shortages reported in the Telegram group, by draft — read fresh with every load of the items.
  const [shortagesByInvoice, setShortagesByInvoice] = useState<Record<string, OrderShortageItem[]>>({});
  // Each draft's items on its Telegram group messages and what the driver confirmed loaded of them.
  const [loadingsByInvoice, setLoadingsByInvoice] = useState<Record<string, OrderLoadingView>>({});
  // The breakdown entry whose loading choices are open.
  const [loadingTarget, setLoadingTarget] = useState<{ loading: BreakdownLoading; name: string; source: string } | null>(null);
  // Loading changes made here and not sent to Telegram yet (kept in this browser until sent or discarded).
  const [pending, setPending] = useState<PendingLoading>(readPending);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const pendingCount = Object.keys(pending).length;

  function updatePending(next: PendingLoading) {
    setPending(next);
    writePending(next);
  }

  function setLoading(entries: BreakdownLoading[], received: (entry: BreakdownLoading) => number | null) {
    const next = { ...pending };
    for (const entry of entries) {
      const key = pendingKey(entry.invoice_id, entry.item.item_key);
      const value = received(entry);
      const sent = loadingsByInvoice[entry.invoice_id]?.loading?.items.find((item) => item.item_key === entry.item.item_key);
      // Back to what was sent: nothing left to send.
      if ((value === null && !sent) || (value !== null && sent?.received === value)) delete next[key];
      else next[key] = value;
    }
    updatePending(next);
  }

  async function sendPending() {
    setIsSending(true);
    setSendError(null);
    try {
      const changes = Object.entries(pending).map(([key, received]) => {
        const at = key.indexOf("|");
        return { order_id: key.slice(0, at), item_key: key.slice(at + 1), received };
      });
      const result = await sendLoadingBatch(changes);
      setLoadingsByInvoice((current) => ({ ...current, ...result.loadings }));
      // Keep what failed, to send again.
      const failedOrders = new Set(result.failed.map((failure) => failure.order_id));
      updatePending(Object.fromEntries(Object.entries(pending).filter(([key]) => failedOrders.has(key.slice(0, key.indexOf("|"))))));
      if (result.failed.length > 0) setSendError(`${result.failed.length} invoice(s) couldn't be saved: ${result.failed[0].error}`);
      else if (result.telegram_failed > 0) setSendError(`Saved, but ${result.telegram_failed} Telegram message(s) couldn't be updated`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSending(false);
    }
  }

  const loadItems = useCallback((options?: { force?: boolean }) => {
    // The category order only affects how items are arranged; without it they still list.
    fetchItemCategorySettings(options)
      .then((settings) => setCategoryOrder(settings.order))
      .catch(() => setCategoryOrder([]));
    fetchBackupLists(options)
      .then((result) => {
        setBackupLists(result);
        // Backup lists are confirmed loaded the same way as invoices (keyed by their BK- id).
        fetchOrderLoadings(result.lists.map((list) => list.id))
          .then((loadings) => setLoadingsByInvoice((current) => ({ ...current, ...loadings })))
          .catch(() => {});
      })
      .catch(() => setBackupLists({ lists: [], missing: [] }));
    return fetchDraftLineItems(options)
      .then((list) => {
        setItems(list);
        const invoiceIds = [...new Set(list.flatMap((item) => item.breakdown.map((entry) => entry.invoice_id)))];
        fetchPreparationStatuses(invoiceIds)
          .then((statuses) =>
            setShortagesByInvoice(Object.fromEntries(Object.entries(statuses).map(([id, entry]) => [id, entry.items ?? []]))),
          )
          .catch(() => {});
        fetchOrderLoadings(invoiceIds)
          .then((loadings) => setLoadingsByInvoice((current) => ({ ...current, ...loadings })))
          .catch(() => {});
      })
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Checked/expanded state is per row, and the same item can appear under
  // several days, so rows are keyed by day + name.
  function toggleChecked(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const dayGroups = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return groupItemsByScheduledDay(items).map((group) => {
      const sorted = [...group.items].sort((a, b) => {
        if (sortKey === "quantity") return direction * (a.quantity - b.quantity);
        return direction * a.name.localeCompare(b.name);
      });
      return { ...group, items: sorted, categories: groupItemsByCategory(sorted, categoryOrder) };
    });
  }, [items, sortKey, sortDirection, categoryOrder]);

  // Category headings only help once items actually have categories.
  const hasCategories = items.some((item) => item.category);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Items</h1>
        <div className="page-header__actions">
          <CopyButton getText={() => formatItemsForCopy(items)} />
          <RefreshButton onRefresh={() => loadItems({ force: true })} />
        </div>
      </div>
      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle__option${tab === "invoices" ? " mode-toggle__option--active" : ""}`}
          onClick={() => setTab("invoices")}
        >
          Invoice items
        </button>
        <button
          type="button"
          className={`mode-toggle__option${tab === "backups" ? " mode-toggle__option--active" : ""}`}
          onClick={() => setTab("backups")}
        >
          Backups
        </button>
      </div>

      {tab === "invoices" ? (
        <>
          <p className="page-subtitle">
            {items.length} item{items.length === 1 ? "" : "s"} across drafts
          </p>

          <SortRow options={SORT_OPTIONS} activeKey={sortKey} direction={sortDirection} onToggle={toggleSort} />

          {dayGroups.length === 0 ? (
            <div className="line-items">
              <div className="items-area__empty">No items in drafts</div>
            </div>
          ) : (
            dayGroups.map((group) => (
              <section key={group.date ?? "unscheduled"} className="day-group">
                <DayGroupHeader
                  date={group.date}
                  count={group.items.length}
                  noun="item"
                  carriedOverCount={group.carriedOverDraftCount}
                  actions={<CopyButton getText={() => formatItemsForCopy(group.items)} />}
                />
                {group.categories.map((categoryGroup) => (
                  <div key={categoryGroup.category ?? ""} className="category-group">
                    {hasCategories && (
                      <div className="category-group__header">
                        <span className="category-group__label">{categoryGroup.category ?? "Uncategorized"}</span>
                        <span className="category-group__meta">
                          <span className="category-group__count">{categoryGroup.items.length}</span>
                          <CopyButton getText={() => formatItemsForCopy(categoryGroup.items)} />
                        </span>
                      </div>
                    )}
                    <div className="line-items day-group__line-items">
                      {categoryGroup.items.map((item) => {
                        const rowKey = `${group.date ?? ""}|${item.name}`;
                        return (
                          <ItemBreakdownRow
                            key={rowKey}
                            item={item}
                            isChecked={checkedItems.has(rowKey)}
                            isExpanded={expandedItems.has(rowKey)}
                            onToggleChecked={() => toggleChecked(rowKey)}
                            onToggleExpanded={() => toggleExpanded(rowKey)}
                            shortages={shortagesForBreakdown(item.breakdown, shortagesByInvoice)}
                            loadings={loadingsForBreakdown(item.breakdown, loadingsByInvoice, pending)}
                            onLoadingTap={(index) => {
                              const loading = loadingsForBreakdown(item.breakdown, loadingsByInvoice, pending)[index];
                              const entry = item.breakdown[index];
                              if (!loading || !entry) return;
                              setLoadingTarget({ loading, name: item.name, source: `${entry.customer_name} · ${entry.invoice_number}` });
                            }}
                            onAllComplete={() =>
                              setLoading(
                                loadingsForBreakdown(item.breakdown, loadingsByInvoice, pending).filter(
                                  (entry): entry is BreakdownLoading => !!entry,
                                ),
                                (entry) => entry.item.ordered,
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </>
      ) : (
        <>
          <div className="sort-row backup-view-switch">
            {(["merged", "grouped"] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`pill${backupView === view ? " pill--active" : ""}`}
                onClick={() => setBackupView(view)}
              >
                {view === "merged" ? "Merged" : "Grouped"}
              </button>
            ))}
          </div>
          <BackupMissingSection missing={backupLists.missing} />
          {backupView === "merged" ? (
            <BackupMergedView
              lists={backupLists.lists}
              loadingsFor={(entries) => loadingsForBreakdown(entries, loadingsByInvoice, pending)}
              onLoadingTap={(loading, name, source) => setLoadingTarget({ loading, name, source })}
              onAllComplete={(loadings) => setLoading(loadings, (entry) => entry.item.ordered)}
            />
          ) : backupLists.lists.length === 0 ? (
            <div className="line-items">
              <div className="items-area__empty">No backup lists</div>
            </div>
          ) : (
            <BackupListsSection
              lists={backupLists.lists}
              onRemoved={() => fetchBackupLists().then(setBackupLists).catch(() => setBackupLists({ lists: [], missing: [] }))}
            />
          )}
        </>
      )}
      {loadingTarget && (
        <ItemLoadingSheet
          title={loadingTarget.name}
          subtitle={loadingTarget.source}
          loading={loadingTarget.loading}
          onSave={(received) => {
            setLoading([loadingTarget.loading], () => received);
            setLoadingTarget(null);
          }}
          onCancel={() => setLoadingTarget(null)}
        />
      )}
      {(pendingCount > 0 || sendError) && (
        <div className="loading-send-bar">
          <span className="loading-send-bar__message">
            {sendError ?? `${pendingCount} change${pendingCount === 1 ? "" : "s"} not sent`}
          </span>
          <div className="save-items-bar__actions">
            {pendingCount > 0 && (
              <button
                type="button"
                className="btn btn--secondary btn--discard"
                disabled={isSending}
                onClick={() => {
                  updatePending({});
                  setSendError(null);
                }}
              >
                Discard
              </button>
            )}
            {pendingCount > 0 ? (
              <button type="button" className="btn btn--save" disabled={isSending} onClick={sendPending}>
                {isSending ? "Sending..." : "Send to Telegram"}
              </button>
            ) : (
              <button type="button" className="btn btn--secondary btn--discard" onClick={() => setSendError(null)}>
                OK
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PENDING_STORAGE_KEY = "items-loading-pending";

/** Unsent loading changes kept in this browser (none when storage isn't available). */
function readPending(): PendingLoading {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingLoading) : {};
  } catch {
    return {};
  }
}

function writePending(pending: PendingLoading) {
  try {
    if (Object.keys(pending).length === 0) localStorage.removeItem(PENDING_STORAGE_KEY);
    else localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Not kept across reloads; still sent from memory.
  }
}
