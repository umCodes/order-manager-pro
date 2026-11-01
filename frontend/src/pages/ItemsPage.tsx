import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBackupLists, fetchDraftLineItems, fetchItemCategorySettings, fetchPreparationStatuses } from "../lib/api";
import { shortagesForBreakdown } from "../lib/shortages";
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
import type { BackupList, BackupMissingItem, DraftLineItemSummary, OrderShortageItem } from "../types";

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

  const loadItems = useCallback((options?: { force?: boolean }) => {
    // The category order only affects how items are arranged; without it they still list.
    fetchItemCategorySettings(options)
      .then((settings) => setCategoryOrder(settings.order))
      .catch(() => setCategoryOrder([]));
    fetchBackupLists(options).then(setBackupLists).catch(() => setBackupLists({ lists: [], missing: [] }));
    return fetchDraftLineItems(options)
      .then((list) => {
        setItems(list);
        const invoiceIds = [...new Set(list.flatMap((item) => item.breakdown.map((entry) => entry.invoice_id)))];
        fetchPreparationStatuses(invoiceIds)
          .then((statuses) =>
            setShortagesByInvoice(Object.fromEntries(Object.entries(statuses).map(([id, entry]) => [id, entry.items ?? []]))),
          )
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
            <BackupMergedView lists={backupLists.lists} />
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
    </div>
  );
}
