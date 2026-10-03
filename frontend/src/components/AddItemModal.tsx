import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { fetchItems } from "../lib/api";
import AddItemRow, { type DraftForm } from "./AddItemRow";
import RefreshButton from "./RefreshButton";
import type { Cart, CatalogItem } from "../types";

type Props = {
  open: boolean;
  cart: Cart;
  /** Item to pre-expand and scroll to when the sheet opens, if any. */
  initialItemId?: string | null;
  onClose: () => void;
  /** The header's Cancel button; defaults to onClose. */
  onCancel?: () => void;
  onCommitItem: (itemId: string, values: DraftForm, item: CatalogItem) => void;
  onRemoveItem: (itemId: string) => void;
  /** Called with the fresh catalog after the user refreshes the items list. */
  onItemsRefreshed?: (items: CatalogItem[]) => void;
  /** Whether each item's editor offers the "Exclude from Telegram" toggle. Defaults to true. */
  showExcludeFromTelegram?: boolean;
  /**
   * Return Invoice mode: offer only these items (an invoice's own lines)
   * instead of the catalog, each capped at its returnable quantity, with
   * the price fixed.
   */
  returnItems?: { items: CatalogItem[]; maxQuantity: Record<string, number> };
};

/**
 * Bottom-sheet catalog browser for adding/editing invoice line items.
 * Remounted (via `key`) each time it opens so its search/expand state
 * always starts fresh.
 */
export default function AddItemModal({
  open,
  cart,
  initialItemId,
  onClose,
  onCancel,
  onCommitItem,
  onRemoveItem,
  onItemsRefreshed,
  showExcludeFromTelegram,
  returnItems,
}: Props) {
  return (
    <div className={`sheet-overlay${open ? " sheet-overlay--open" : ""}`}>
      <div className="sheet-overlay__backdrop" onClick={onClose} />
      <div className="sheet-anchor">
        <div className={`sheet${open ? " sheet--open" : ""}`}>
          <SheetContent
            key={String(open)}
            cart={cart}
            initialItemId={initialItemId}
            onClose={onClose}
            onCancel={onCancel}
            onCommitItem={onCommitItem}
            onRemoveItem={onRemoveItem}
            onItemsRefreshed={onItemsRefreshed}
            showExcludeFromTelegram={showExcludeFromTelegram}
            returnItems={returnItems}
          />
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM: DraftForm = {
  description: "",
  quantity: "1",
  rate: "0",
  excludeFromTelegram: false,
};

type SheetContentProps = Omit<Props, "open">;

function SheetContent({
  cart,
  initialItemId,
  onClose,
  onCancel = onClose,
  onCommitItem,
  onRemoveItem,
  onItemsRefreshed,
  showExcludeFromTelegram = true,
  returnItems,
}: SheetContentProps) {
  const [items, setItems] = useState<CatalogItem[]>(returnItems?.items ?? []);
  const [expandedId, setExpandedId] = useState<string | null>(initialItemId ?? null);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (returnItems) return; // fixed list: the invoice's own items
    fetchItems().then((fetchedItems) => {
      setItems(fetchedItems);
      if (initialItemId) {
        const item = fetchedItems.find((i) => i.item_id === initialItemId);
        const existing = cart[initialItemId];
        if (item) {
          setForm({
            description: existing?.description ?? item.description,
            quantity: String(existing?.quantity ?? 1),
            rate: String(existing?.rate ?? item.rate),
            excludeFromTelegram: existing?.excludeFromTelegram ?? false,
          });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialItemId && items.length > 0) {
      rowRefs.current[initialItemId]?.scrollIntoView({ block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  function toggleExpand(item: CatalogItem) {
    if (expandedId === item.item_id) {
      setExpandedId(null);
      return;
    }
    const existing = cart[item.item_id];
    setForm({
      description: existing?.description ?? item.description,
      // A return starts at the full returnable quantity (the common case).
      quantity: String(existing?.quantity ?? (returnItems ? returnItems.maxQuantity[item.item_id] ?? 1 : 1)),
      rate: String(existing?.rate ?? item.rate),
      excludeFromTelegram: existing?.excludeFromTelegram ?? false,
    });
    setExpandedId(item.item_id);
  }

  function commit(item: CatalogItem) {
    onCommitItem(item.item_id, form, item);
    setExpandedId(null);
  }

  function remove(item: CatalogItem) {
    onRemoveItem(item.item_id);
    setExpandedId(null);
  }

  /** Items change rarely, so they're cached (in memory and by the PWA); this pulls the latest catalog. */
  function handleRefreshItems() {
    return fetchItems({ force: true }).then((fetchedItems) => {
      setItems(fetchedItems);
      onItemsRefreshed?.(fetchedItems);
    });
  }

  return (
    <>
      <div className="sheet__header">
        <div className="sheet__header-row">
          <button type="button" className="sheet__cancel" onClick={onCancel}>
            Cancel
          </button>
          <div className="sheet__title">{returnItems ? "Return Items" : "Items"}</div>
          <span className="sheet__spacer sheet__spacer--action">
            {returnItems ? (
              <button type="button" className="sheet__cancel" onClick={onClose}>
                Done
              </button>
            ) : (
              <RefreshButton onRefresh={handleRefreshItems} />
            )}
          </span>
        </div>
        <div className="sheet__search">
          <Search className="sheet__search-icon" size={16} />
          <input
            type="text"
            className="input sheet__search-input"
            placeholder="Search items"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="sheet__list">
        {filteredItems.map((item) => (
          <AddItemRow
            key={item.item_id}
            ref={(el) => { rowRefs.current[item.item_id] = el; }}
            item={item}
            inCart={cart[item.item_id]}
            isExpanded={expandedId === item.item_id}
            form={form}
            onToggleExpand={() => toggleExpand(item)}
            onFormChange={setForm}
            onCommit={() => commit(item)}
            onRemove={() => remove(item)}
            showExcludeFromTelegram={showExcludeFromTelegram && !returnItems}
            maxQuantity={returnItems?.maxQuantity[item.item_id]}
          />
        ))}
      </div>
    </>
  );
}
