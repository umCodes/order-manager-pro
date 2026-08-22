import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDraftLineItems } from "../lib/api";
import { formatItemsForCopy } from "../lib/itemSummary";
import { useSortState } from "../hooks/useSortState";
import SortRow from "../components/SortRow";
import ItemBreakdownRow from "../components/ItemBreakdownRow";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import type { DraftLineItemSummary } from "../types";

type SortKey = "name" | "quantity";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "quantity", label: "Quantity" },
];

/** Aggregated view of every line item across all draft invoices, with a per-item source breakdown. */
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

  function toggleChecked(name: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleExpanded(name: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const sortedItems = useMemo(() => {
    const list = [...items];
    const direction = sortDirection === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "quantity") return direction * (a.quantity - b.quantity);
      return direction * a.name.localeCompare(b.name);
    });
    return list;
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

      <div className="line-items">
        {sortedItems.length === 0 ? (
          <div className="items-area__empty">No items in drafts</div>
        ) : (
          sortedItems.map((item) => (
            <ItemBreakdownRow
              key={item.name}
              item={item}
              isChecked={checkedItems.has(item.name)}
              isExpanded={expandedItems.has(item.name)}
              onToggleChecked={() => toggleChecked(item.name)}
              onToggleExpanded={() => toggleExpanded(item.name)}
            />
          ))
        )}
      </div>
    </div>
  );
}
