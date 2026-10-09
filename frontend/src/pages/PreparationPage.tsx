import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchPrepOrders, savePrepStep } from "../lib/api";
import { isFullyPrepared, todayDate, todaysOrders } from "../lib/preparation";
import { describeScheduledDay } from "../lib/scheduledDate";
import RefreshButton from "../components/RefreshButton";
import PrepOrderCard from "../components/preparation/PrepOrderCard";
import AmountSheet from "../components/preparation/AmountSheet";
import ConfirmLinesModal from "../components/preparation/ConfirmLinesModal";
import { StatusLegend } from "../components/preparation/LineBadge";
import type { PrepLineItem, PrepOrder } from "../types";

type Change = { line_item_id: string; quantity: number | null };

/** The whole-order action waiting on a yes: marking the rest prepared, or undoing what's recorded. */
type PendingConfirm = { kind: "all" | "undo"; invoiceId: string };

/**
 * The preparation screen (/prep): today's orders — today's and anything
 * overdue, as on the Drafts tab — one card per order, where the preparer
 * records how much of each item was actually prepared against what was
 * ordered. Cards start open; a fully prepared order folds down to its
 * invoice number and customer. Recording here never changes the invoice.
 *
 * Data (items, amounts) is Amharic, in the Telegram message's wording;
 * controls use whichever of English or Amharic is shorter; statuses are
 * icons, named once in the legend.
 */
export default function PreparationPage() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Folded / unfolded by hand; without an entry a card is folded exactly when it's fully prepared.
  const [collapsedOverride, setCollapsedOverride] = useState<Map<string, boolean>>(new Map());
  const [editing, setEditing] = useState<{ invoiceId: string; lineItemId: string } | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const loadOrders = useCallback(() => {
    return fetchPrepOrders()
      .then((loaded) => {
        setOrders(loaded);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load orders"))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const today = useMemo(() => todaysOrders(orders), [orders]);
  const lines = today.flatMap((order) => order.line_items);
  const recordedCount = lines.filter((line) => line.prepared !== null).length;

  const findOrder = (invoiceId: string) => orders.find((o) => o.invoice_id === invoiceId);
  const editingOrder = editing ? findOrder(editing.invoiceId) : undefined;
  const editingLine = editingOrder?.line_items.find((l) => l.line_item_id === editing?.lineItemId);
  const pendingOrder = pending ? findOrder(pending.invoiceId) : undefined;

  function updateLines(invoiceId: string, update: (line: PrepLineItem) => PrepLineItem) {
    setOrders((prev) =>
      prev.map((order) => (order.invoice_id !== invoiceId ? order : { ...order, line_items: order.line_items.map(update) })),
    );
  }

  function unsetOverride(invoiceId: string) {
    setCollapsedOverride((prev) => {
      const next = new Map(prev);
      next.delete(invoiceId);
      return next;
    });
  }

  /** Saves prepared amounts for some lines of one order: shown right away, put back if the save fails. */
  function save(invoiceId: string, changes: Change[]) {
    if (changes.length === 0) return;
    const before = findOrder(invoiceId);
    const changed = new Map(changes.map((c) => [c.line_item_id, c.quantity]));
    updateLines(invoiceId, (line) => (changed.has(line.line_item_id) ? { ...line, prepared: changed.get(line.line_item_id) ?? null } : line));
    // Let the card fold (or unfold) by its new status.
    unsetOverride(invoiceId);
    setSaveError(null);
    setSavingIds((prev) => new Set(prev).add(invoiceId));

    savePrepStep(invoiceId, "prepared", changes)
      .then((saved) =>
        updateLines(invoiceId, (line) => (changed.has(line.line_item_id) ? { ...line, prepared: saved[line.line_item_id]?.prepared ?? null } : line)),
      )
      .catch((e) => {
        if (before) {
          updateLines(invoiceId, (line) =>
            changed.has(line.line_item_id)
              ? { ...line, prepared: before.line_items.find((l) => l.line_item_id === line.line_item_id)?.prepared ?? null }
              : line,
          );
        }
        setSaveError(`Not saved — try again (${e instanceof Error ? e.message : "error"})`);
      })
      .finally(() =>
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        }),
      );
  }

  function confirmPending() {
    if (!pending || !pendingOrder) return;
    if (pending.kind === "all") {
      save(
        pendingOrder.invoice_id,
        pendingOrder.line_items.filter((l) => l.prepared === null).map((l) => ({ line_item_id: l.line_item_id, quantity: l.quantity })),
      );
    } else {
      save(
        pendingOrder.invoice_id,
        pendingOrder.line_items.filter((l) => l.prepared !== null).map((l) => ({ line_item_id: l.line_item_id, quantity: null })),
      );
    }
    setPending(null);
  }

  return (
    <div className="prp-page">
      <div className="page-header">
        <h1 className="page-title">Preparation</h1>
        <div className="page-header__actions">
          <RefreshButton onRefresh={loadOrders} />
        </div>
      </div>

      {isLoading ? (
        <div className="prp-empty">
          <Loader2 size={22} className="refresh-button__icon--spinning" />
          Loading…
        </div>
      ) : loadError ? (
        <div className="prp-empty">
          <div className="form-error">{loadError}</div>
          <button type="button" className="prp-btn prp-btn--primary" onClick={() => loadOrders()}>
            Retry
          </button>
        </div>
      ) : today.length === 0 ? (
        <div className="prp-empty">No orders for today</div>
      ) : (
        <>
          <p className="prp-progress-text">
            {recordedCount} of {lines.length} items prepared · ዛሬ {describeScheduledDay(todayDate()).shortDate}
          </p>
          <StatusLegend />

          {saveError && (
            <div className="prp-error" role="alert">
              {saveError}
              <button type="button" className="prp-error__close" onClick={() => setSaveError(null)}>
                OK
              </button>
            </div>
          )}

          <div className="prp-list">
            {today.map((order) => (
              <PrepOrderCard
                key={order.invoice_id}
                order={order}
                isCollapsed={collapsedOverride.get(order.invoice_id) ?? isFullyPrepared(order)}
                isSaving={savingIds.has(order.invoice_id)}
                onToggleCollapsed={() =>
                  setCollapsedOverride((prev) =>
                    new Map(prev).set(order.invoice_id, !(prev.get(order.invoice_id) ?? isFullyPrepared(order))),
                  )
                }
                onEditLine={(line) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                onConfirmAll={() => setPending({ kind: "all", invoiceId: order.invoice_id })}
                onUndoAll={() => setPending({ kind: "undo", invoiceId: order.invoice_id })}
              />
            ))}
          </div>
        </>
      )}

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

      {pending && pendingOrder && (
        <ConfirmLinesModal
          order={pendingOrder}
          title={pending.kind === "all" ? "All prepared?" : "Undo preparation?"}
          lines={
            pending.kind === "all"
              ? pendingOrder.line_items.filter((l) => l.prepared === null).map((line) => ({ line, amount: line.quantity }))
              : pendingOrder.line_items.filter((l) => l.prepared !== null).map((line) => ({ line, amount: line.prepared ?? 0 }))
          }
          confirmLabel={pending.kind === "all" ? "Confirm" : "Undo"}
          isDanger={pending.kind === "undo"}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
