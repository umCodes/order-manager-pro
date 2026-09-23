import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDraftLineItems } from "../lib/api";
import { formatItemsForCopy, groupItemsByScheduledDay } from "../lib/itemSummary";
import { useSortState } from "../hooks/useSortState";
import SortRow from "../components/SortRow";
import ItemBreakdownRow from "../components/ItemBreakdownRow";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import DayGroupHeader from "../components/DayGroupHeader";
import type { DraftLineItemSummary } from "../types";

type SortKey = "name" | "quantity";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "quantity", label: "Quantity" },
];

/**
 * Aggregated view of every line item across all draft invoices, split into
 * one section per scheduled day (past-due drafts count toward today, as on
 * the Drafts tab), with a per-item source breakdown.
 */
export default function ItemsPage() {
  const [items, setItems] = useState<DraftLineItemSummary[]>([]);
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("quantity", "desc");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const loadItems = useCallback((options?: { force?: boolean }) => {
    return fetchDraftLineItems(options).then(setItems).catch(() => setItems([]));
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
    return groupItemsByScheduledDay(items).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        if (sortKey === "quantity") return direction * (a.quantity - b.quantity);
        return direction * a.name.localeCompare(b.name);
      }),
    }));
  }, [items, sortKey, sortDirection]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Items</h1>
        <div className="page-header__actions">
          <CopyButton getText={() => formatItemsForCopy(items)} />
          <RefreshButton onRefresh={() => loadItems({ force: true })} />
        </div>
      </div>
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
            <div className="line-items day-group__line-items">
              {group.items.map((item) => {
                const rowKey = `${group.date ?? ""}|${item.name}`;
                return (
                  <ItemBreakdownRow
                    key={rowKey}
                    item={item}
                    isChecked={checkedItems.has(rowKey)}
                    isExpanded={expandedItems.has(rowKey)}
                    onToggleChecked={() => toggleChecked(rowKey)}
                    onToggleExpanded={() => toggleExpanded(rowKey)}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
