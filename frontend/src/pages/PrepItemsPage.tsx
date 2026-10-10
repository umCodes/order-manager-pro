import { useState } from "react";
import { itemsForDay } from "../lib/preparation";
import PrepDayLayout from "../components/preparation/PrepDayLayout";
import PrepItemCard from "../components/preparation/PrepItemCard";
import AmountSheet from "../components/preparation/AmountSheet";
import type { PrepOrdersState } from "../hooks/usePrepOrders";

type Props = {
  prep: PrepOrdersState;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

/**
 * The Items tab: the selected day's orders rolled up per item — the picking
 * list — biggest first. Each item opens to the orders it's for; recording an
 * amount there is the same as on the Prepare tab.
 */
export default function PrepItemsPage({ prep, selectedDate, onSelectDate }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ invoiceId: string; lineItemId: string } | null>(null);

  const editingOrder = editing ? prep.orders.find((o) => o.invoice_id === editing.invoiceId) : undefined;
  const editingLine = editingOrder?.line_items.find((l) => l.line_item_id === editing?.lineItemId);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <PrepDayLayout title="Items" prep={prep} selectedDate={selectedDate} onSelectDate={onSelectDate}>
        {(day) => (
          <div className="prp-list">
            {itemsForDay(day.orders).map((item) => {
              const key = `${item.label}|${item.unit}`;
              return (
                <PrepItemCard
                  key={key}
                  item={item}
                  isExpanded={expanded.has(key)}
                  onToggleExpanded={() => toggle(key)}
                  onEditLine={({ order, line }) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                />
              );
            })}
          </div>
        )}
      </PrepDayLayout>

      {editingOrder && editingLine && (
        <AmountSheet
          key={`${editingOrder.invoice_id}|${editingLine.line_item_id}`}
          order={editingOrder}
          line={editingLine}
          onClose={() => setEditing(null)}
          onSave={(quantity) => {
            setEditing(null);
            prep.savePrepared(editingOrder.invoice_id, [{ line_item_id: editingLine.line_item_id, quantity }]);
          }}
        />
      )}
    </>
  );
}
