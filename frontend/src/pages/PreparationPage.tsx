import { useState } from "react";
import { isFullyPrepared } from "../lib/preparation";
import PrepDayLayout from "../components/preparation/PrepDayLayout";
import PrepOrderCard from "../components/preparation/PrepOrderCard";
import AmountSheet from "../components/preparation/AmountSheet";
import ConfirmLinesModal from "../components/preparation/ConfirmLinesModal";
import type { PrepOrdersState } from "../hooks/usePrepOrders";

type Props = {
  prep: PrepOrdersState;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

/**
 * The Prepare tab: one card per order for the selected day, by invoice
 * number, where the preparer records how much of each item was actually
 * prepared against what was ordered. Cards start open; a fully prepared
 * order folds down to its invoice number and customer. Recording here never
 * changes the invoice.
 *
 * Data (items, amounts) is Amharic, in the Telegram message's wording;
 * controls use whichever of English or Amharic is shorter; statuses are
 * icons, named once in the legend.
 */
export default function PreparationPage({ prep, selectedDate, onSelectDate }: Props) {
  // Folded / unfolded by hand; without an entry a card is folded exactly when it's fully prepared.
  const [collapsedOverride, setCollapsedOverride] = useState<Map<string, boolean>>(new Map());
  const [editing, setEditing] = useState<{ invoiceId: string; lineItemId: string } | null>(null);
  // The order whose "All prepared" is waiting on a yes.
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);

  const findOrder = (invoiceId: string) => prep.orders.find((o) => o.invoice_id === invoiceId);
  const editingOrder = editing ? findOrder(editing.invoiceId) : undefined;
  const editingLine = editingOrder?.line_items.find((l) => l.line_item_id === editing?.lineItemId);
  const pendingOrder = pendingInvoiceId ? findOrder(pendingInvoiceId) : undefined;

  /** Saves, and lets the card fold (or unfold) by its new status. */
  function save(invoiceId: string, changes: { line_item_id: string; quantity: number }[]) {
    setCollapsedOverride((prev) => {
      const next = new Map(prev);
      next.delete(invoiceId);
      return next;
    });
    prep.savePrepared(invoiceId, changes);
  }

  /** Marks every line of the order not recorded yet as fully prepared. */
  function confirmAllPrepared() {
    if (!pendingOrder) return;
    save(
      pendingOrder.invoice_id,
      pendingOrder.line_items.filter((l) => l.prepared === null).map((l) => ({ line_item_id: l.line_item_id, quantity: l.quantity })),
    );
    setPendingInvoiceId(null);
  }

  return (
    <>
      <PrepDayLayout title="Preparation" prep={prep} selectedDate={selectedDate} onSelectDate={onSelectDate}>
        {(day) => (
          <div className="prp-list">
            {day.orders.map((order) => (
              <PrepOrderCard
                key={order.invoice_id}
                order={order}
                isCollapsed={collapsedOverride.get(order.invoice_id) ?? isFullyPrepared(order)}
                isSaving={prep.savingIds.has(order.invoice_id)}
                onToggleCollapsed={() =>
                  setCollapsedOverride((prev) =>
                    new Map(prev).set(order.invoice_id, !(prev.get(order.invoice_id) ?? isFullyPrepared(order))),
                  )
                }
                onEditLine={(line) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                onConfirmAll={() => setPendingInvoiceId(order.invoice_id)}
              />
            ))}
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
            save(editingOrder.invoice_id, [{ line_item_id: editingLine.line_item_id, quantity }]);
          }}
        />
      )}

      {pendingOrder && (
        <ConfirmLinesModal
          order={pendingOrder}
          title="All prepared?"
          lines={pendingOrder.line_items.filter((l) => l.prepared === null).map((line) => ({ line, amount: line.quantity }))}
          confirmLabel="Confirm"
          onConfirm={confirmAllPrepared}
          onCancel={() => setPendingInvoiceId(null)}
        />
      )}
    </>
  );
}
