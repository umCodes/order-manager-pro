import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchPrepOrders, savePrepShipments } from "../lib/api";
import {
  formatDayReport,
  groupLinesByItem,
  groupOrdersByDay,
  summarizeDay,
  type ItemLine,
} from "../lib/prep";
import { describeScheduledDay } from "../lib/scheduledDate";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import PrepOrderCard from "../components/PrepOrderCard";
import PrepItemCard from "../components/PrepItemCard";
import ShippedQuantitySheet from "../components/ShippedQuantitySheet";
import type { PrepOrder } from "../types";

type View = "customers" | "items";

type ShipmentChange = { line_item_id: string; quantity: number | null };

function dayLabel(date: string | null): string {
  return date ? describeScheduledDay(date).label : "No date";
}

/**
 * The preparers' screen (opened at /prep): the drafts for one day, either
 * per customer (loading an order) or per item (picking in the warehouse),
 * where they record what actually went out. Everything is assumed to ship in
 * full with one tap; only a shortfall needs the quantity sheet. Recording a
 * shipment never changes the invoice itself.
 */
export default function PrepPage() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<View>("customers");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [savingInvoiceIds, setSavingInvoiceIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ invoiceId: string; lineItemId: string } | null>(null);

  const loadOrders = useCallback(() => {
    return fetchPrepOrders()
      .then((loaded) => {
        setOrders([...loaded].sort((a, b) => a.customer_name.localeCompare(b.customer_name)));
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load the orders"))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const days = useMemo(() => groupOrdersByDay(orders), [orders]);
  // Default to the first day (today, with anything past due) until one is picked.
  const day = days.find((d) => d.date === selectedDate) ?? days[0];
  const summary = day ? summarizeDay(day.orders) : null;
  const items = useMemo(() => (day ? groupLinesByItem(day.orders) : []), [day]);

  const editingOrder = editing ? orders.find((o) => o.invoice_id === editing.invoiceId) : undefined;
  const editingLine = editingOrder?.line_items.find((l) => l.line_item_id === editing?.lineItemId);

  function applyToOrder(invoiceId: string, shippedById: (lineItemId: string, current: number | null) => number | null) {
    setOrders((prev) =>
      prev.map((order) =>
        order.invoice_id !== invoiceId
          ? order
          : {
              ...order,
              line_items: order.line_items.map((line) => ({ ...line, shipped: shippedById(line.line_item_id, line.shipped) })),
            },
      ),
    );
  }

  /** Saves some lines of one order, showing the change right away and putting it back if the save fails. */
  function saveChanges(invoiceId: string, changes: ShipmentChange[]) {
    if (changes.length === 0) return;
    const before = orders.find((o) => o.invoice_id === invoiceId);
    const changed = new Map(changes.map((c) => [c.line_item_id, c.quantity]));
    applyToOrder(invoiceId, (id, current) => (changed.has(id) ? changed.get(id)! : current));
    setSaveError(null);
    setSavingInvoiceIds((prev) => new Set(prev).add(invoiceId));

    savePrepShipments(invoiceId, changes)
      // Only touch the lines this save was about, so an overlapping save on the same order isn't undone.
      .then((saved) => applyToOrder(invoiceId, (id, current) => (changed.has(id) ? (saved[id] ?? null) : current)))
      .catch((e) => {
        if (before) applyToOrder(invoiceId, (id) => before.line_items.find((l) => l.line_item_id === id)?.shipped ?? null);
        setSaveError(`Not saved: ${e instanceof Error ? e.message : "please try again"}`);
      })
      .finally(() =>
        setSavingInvoiceIds((prev) => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        }),
      );
  }

  function shipRestOfOrder(order: PrepOrder) {
    saveChanges(
      order.invoice_id,
      order.line_items.filter((l) => l.shipped === null).map((l) => ({ line_item_id: l.line_item_id, quantity: l.quantity })),
    );
  }

  function shipRestOfItem(lines: ItemLine[]) {
    const byOrder = new Map<string, ShipmentChange[]>();
    for (const { order, line } of lines) {
      if (line.shipped !== null) continue;
      const changes = byOrder.get(order.invoice_id) ?? [];
      changes.push({ line_item_id: line.line_item_id, quantity: line.quantity });
      byOrder.set(order.invoice_id, changes);
    }
    byOrder.forEach((changes, invoiceId) => saveChanges(invoiceId, changes));
  }

  function toggleExpanded(name: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="prep-page">
      <div className="page-header">
        <h1 className="page-title">Prepare &amp; ship</h1>
        <div className="page-header__actions">
          {day && <CopyButton getText={() => formatDayReport(dayLabel(day.date), day.orders)} />}
          <RefreshButton onRefresh={loadOrders} />
        </div>
      </div>

      {isLoading ? (
        <div className="prep-empty">
          <Loader2 size={22} className="refresh-button__icon--spinning" />
          Loading orders…
        </div>
      ) : loadError ? (
        <div className="prep-empty">
          <div className="form-error">{loadError}</div>
          <button type="button" className="prep-big-btn prep-big-btn--save" onClick={() => loadOrders()}>
            Try again
          </button>
        </div>
      ) : !day || !summary ? (
        <div className="prep-empty">No orders to prepare.</div>
      ) : (
        <>
          {days.length > 1 && (
            <div className="prep-days" role="tablist" aria-label="Day">
              {days.map((d) => {
                const info = d.date ? describeScheduledDay(d.date) : null;
                const isActive = d === day;
                return (
                  <button
                    key={d.date ?? "none"}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`prep-day${isActive ? " prep-day--active" : ""}`}
                    onClick={() => setSelectedDate(d.date)}
                  >
                    <span className="prep-day__label">{dayLabel(d.date)}</span>
                    <span className="prep-day__meta">
                      {info ? `${info.shortDate} · ` : ""}
                      {d.orders.length} order{d.orders.length === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="prep-summary">
            <div className="prep-summary__main">
              <span className="prep-summary__count">
                {summary.finishedCount} <span className="prep-summary__of">of {summary.orderCount}</span>
              </span>
              <span className="prep-summary__label">orders out {dayLabel(day.date).toLowerCase()}</span>
            </div>
            <div className="prep-progress prep-progress--summary" aria-hidden="true">
              <div
                className="prep-progress__bar prep-progress__bar--done"
                style={{ width: `${summary.orderCount ? (summary.finishedCount / summary.orderCount) * 100 : 0}%` }}
              />
            </div>
            {(summary.shortLineCount > 0 || summary.notShippedLineCount > 0 || day.carriedOverCount > 0) && (
              <div className="prep-summary__chips">
                {summary.shortLineCount > 0 && (
                  <span className="prep-chip prep-chip--short">{summary.shortLineCount} went out short</span>
                )}
                {summary.notShippedLineCount > 0 && (
                  <span className="prep-chip prep-chip--none">{summary.notShippedLineCount} not shipped</span>
                )}
                {day.carriedOverCount > 0 && (
                  <span className="prep-chip">{day.carriedOverCount} from an earlier day</span>
                )}
              </div>
            )}
          </div>

          <div className="prep-toggle" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={view === "customers"}
              className={`prep-toggle__btn${view === "customers" ? " prep-toggle__btn--active" : ""}`}
              onClick={() => setView("customers")}
            >
              By customer
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "items"}
              className={`prep-toggle__btn${view === "items" ? " prep-toggle__btn--active" : ""}`}
              onClick={() => setView("items")}
            >
              By item
            </button>
          </div>

          {saveError && (
            <div className="prep-error" role="alert">
              {saveError}
              <button type="button" className="prep-error__close" onClick={() => setSaveError(null)}>
                OK
              </button>
            </div>
          )}

          <div className="prep-list">
            {view === "customers"
              ? day.orders.map((order) => (
                  <PrepOrderCard
                    key={order.invoice_id}
                    order={order}
                    isSaving={savingInvoiceIds.has(order.invoice_id)}
                    onEditLine={(line) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                    onShipAll={() => shipRestOfOrder(order)}
                  />
                ))
              : items.map((item) => (
                  <PrepItemCard
                    key={item.name}
                    item={item}
                    isExpanded={expandedItems.has(item.name)}
                    isSaving={item.lines.some(({ order }) => savingInvoiceIds.has(order.invoice_id))}
                    onToggleExpanded={() => toggleExpanded(item.name)}
                    onEditLine={({ order, line }) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                    onShipAll={() => shipRestOfItem(item.lines)}
                  />
                ))}
          </div>
        </>
      )}

      {editingOrder && editingLine && (
        <ShippedQuantitySheet
          key={`${editingOrder.invoice_id}|${editingLine.line_item_id}`}
          order={editingOrder}
          line={editingLine}
          onClose={() => setEditing(null)}
          onSave={(quantity) => {
            setEditing(null);
            saveChanges(editingOrder.invoice_id, [{ line_item_id: editingLine.line_item_id, quantity }]);
          }}
        />
      )}
    </div>
  );
}
