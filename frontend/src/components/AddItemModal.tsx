import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchItems } from "../lib/api";
import AddItemRow, { type DraftForm } from "./AddItemRow";
import type { Cart, CatalogItem } from "../types";

type Props = {
  open: boolean;
  cart: Cart;
  onClose: () => void;
  onCommitItem: (itemId: string, values: DraftForm) => void;
  onRemoveItem: (itemId: string) => void;
};

/**
 * Bottom-sheet catalog browser for adding/editing invoice line items.
 * Remounted (via `key`) each time it opens so its search/expand state
 * always starts fresh.
 */
export default function AddItemModal({ open, cart, onClose, onCommitItem, onRemoveItem }: Props) {
  return (
    <div className={`sheet-overlay${open ? " sheet-overlay--open" : ""}`}>
      <div className="sheet-overlay__backdrop" onClick={onClose} />
      <div className="sheet-anchor">
        <div className={`sheet${open ? " sheet--open" : ""}`}>
          <SheetContent
            key={String(open)}
            cart={cart}
            onClose={onClose}
            onCommitItem={onCommitItem}
            onRemoveItem={onRemoveItem}
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

function SheetContent({ cart, onClose, onCommitItem, onRemoveItem }: SheetContentProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchItems().then(setItems);
  }, []);

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
      quantity: String(existing?.quantity ?? 1),
      rate: String(existing?.rate ?? item.rate),
      excludeFromTelegram: existing?.excludeFromTelegram ?? false,
    });
    setExpandedId(item.item_id);
  }

  function commit(item: CatalogItem) {
    onCommitItem(item.item_id, form);
    setExpandedId(null);
  }

  function remove(item: CatalogItem) {
    onRemoveItem(item.item_id);
    setExpandedId(null);
  }

  return (
    <>
      <div className="sheet__header">
        <div className="sheet__header-row">
          <button type="button" className="sheet__cancel" onClick={onClose}>
            Cancel
          </button>
          <div className="sheet__title">Items</div>
          <span className="sheet__spacer" />
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
            item={item}
            inCart={cart[item.item_id]}
            isExpanded={expandedId === item.item_id}
            form={form}
            onToggleExpand={() => toggleExpand(item)}
            onFormChange={setForm}
            onCommit={() => commit(item)}
            onRemove={() => remove(item)}
          />
        ))}
      </div>
    </>
  );
}
