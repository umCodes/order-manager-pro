import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ClipboardCheck, Loader2, Package, Truck, Users } from "lucide-react";
import { fetchPrepOrders, savePrepStep } from "../lib/api";
import {
  amharicDay,
  expectedAmount,
  formatDayReport,
  groupLinesByItem,
  groupOrdersByDay,
  openLines,
  recordedCount,
  summarizeStep,
  type ItemLine,
} from "../lib/prep";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import PrepOrderCard from "../components/PrepOrderCard";
import PrepItemCard from "../components/PrepItemCard";
import StepQuantitySheet from "../components/StepQuantitySheet";
import { StatusIcon, StatusLegend } from "../components/PrepStatusIcon";
import type { PrepLineItem, PrepOrder, PrepStep } from "../types";

export type PrepRole = "preparer" | "driver";

type View = "customers" | "items";

type StepChange = { line_item_id: string; quantity: number | null };

/** The preparer's two steps; the driver only ever receives. */
const PREPARER_STEPS: { step: PrepStep; label: string; Icon: typeof Truck }[] = [
  { step: "prepared", label: "Prepare", Icon: ClipboardCheck },
  { step: "sent", label: "Send", Icon: Truck },
];

const SUMMARY_LABEL: Record<PrepStep, string> = {
  prepared: "orders ready",
  sent: "orders sent",
  received: "orders received",
};

/**
 * The warehouse screens. The preparer (at /prep) works in two steps:
 * Prepare — record how much of each line was put together (any amount,
 * 0 included) — then Send — confirm how much of that went out. The driver
 * (at /driver) sees only what was sent and confirms how much they received;
 * a received amount that differs from what was sent is a conflict (⚠),
 * shown to both. Everything is assumed to match with one tap; only a
 * difference needs the quantity sheet. None of it changes the invoice.
 *
 * Data (items, weights, days) is Amharic, in the Telegram message's wording.
 * Controls use whichever of English or Amharic is shorter, and statuses are
 * icons, named once in the legend, so the cards don't get crowded.
 */
export default function PrepPage({ role }: { role: PrepRole }) {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null | undefined>(undefined);
  const [preparerStep, setPreparerStep] = useState<PrepStep>("prepared");
  const [view, setView] = useState<View>("customers");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [savingInvoiceIds, setSavingInvoiceIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ invoiceId: string; lineItemId: string } | null>(null);

  const step: PrepStep = role === "driver" ? "received" : preparerStep;
  const activeView: View = role === "driver" ? "customers" : view;

  const loadOrders = useCallback(() => {
    return fetchPrepOrders()
      .then((loaded) => {
        setOrders([...loaded].sort((a, b) => a.customer_name.localeCompare(b.customer_name)));
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load orders"))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // The driver only sees orders that have started going out.
  const visibleOrders = useMemo(
    () => (role === "driver" ? orders.filter((order) => recordedCount(order, "sent") > 0) : orders),
    [orders, role],
  );
  const days = useMemo(() => groupOrdersByDay(visibleOrders), [visibleOrders]);
  // Default to the first day (today, with anything past due) until one is picked.
  const day = days.find((d) => d.date === selectedDate) ?? days[0];
  const summary = day ? summarizeStep(day.orders, step) : null;
  const items = useMemo(() => (day ? groupLinesByItem(day.orders, step) : []), [day, step]);

  const editingOrder = editing ? orders.find((o) => o.invoice_id === editing.invoiceId) : undefined;
  const editingLine = editingOrder?.line_items.find((l) => l.line_item_id === editing?.lineItemId);

  function updateLines(invoiceId: string, update: (line: PrepLineItem) => PrepLineItem) {
    setOrders((prev) =>
      prev.map((order) => (order.invoice_id !== invoiceId ? order : { ...order, line_items: order.line_items.map(update) })),
    );
  }

  /** Saves one step for some lines of one order, showing it right away and putting it back if the save fails. */
  function saveChanges(invoiceId: string, changes: StepChange[]) {
    if (changes.length === 0) return;
    const savingStep = step;
    const before = orders.find((o) => o.invoice_id === invoiceId);
    const changed = new Map(changes.map((c) => [c.line_item_id, c.quantity]));
    updateLines(invoiceId, (line) =>
      changed.has(line.line_item_id) ? { ...line, [savingStep]: changed.get(line.line_item_id) ?? null } : line,
    );
    setSaveError(null);
    setSavingInvoiceIds((prev) => new Set(prev).add(invoiceId));

    savePrepStep(invoiceId, savingStep, changes)
      // Take the server's word for the lines just saved (including what the other side recorded
      // meanwhile), and only those, so an overlapping save on the same order isn't undone.
      .then((saved) =>
        updateLines(invoiceId, (line) => {
          if (!changed.has(line.line_item_id)) return line;
          const fresh = saved[line.line_item_id];
          return { ...line, prepared: fresh?.prepared ?? null, sent: fresh?.sent ?? null, received: fresh?.received ?? null };
        }),
      )
      .catch((e) => {
        if (before) {
          updateLines(invoiceId, (line) => {
            const old = before.line_items.find((l) => l.line_item_id === line.line_item_id);
            return changed.has(line.line_item_id) && old ? { ...line, [savingStep]: old[savingStep] } : line;
          });
        }
        setSaveError(`Not saved — try again (${e instanceof Error ? e.message : "error"})`);
      })
      .finally(() =>
        setSavingInvoiceIds((prev) => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        }),
      );
  }

  /** Every open line among these goes in at exactly what this step expects. */
  function completeRest(itemLines: ItemLine[]) {
    const byOrder = new Map<string, StepChange[]>();
    for (const { order, line } of itemLines) {
      if (!openLines(order, step).includes(line)) continue;
      const changes = byOrder.get(order.invoice_id) ?? [];
      changes.push({ line_item_id: line.line_item_id, quantity: expectedAmount(line, step) });
      byOrder.set(order.invoice_id, changes);
    }
    byOrder.forEach((changes, invoiceId) => saveChanges(invoiceId, changes));
  }

  function toggleExpanded(label: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="prep-page">
      <div className="page-header">
        <h1 className="page-title">{role === "driver" ? "Delivery" : "Prepare"}</h1>
        <div className="page-header__actions">
          {role === "preparer" && day && <CopyButton getText={() => formatDayReport(day.date, day.orders)} />}
          <RefreshButton onRefresh={loadOrders} />
        </div>
      </div>

      {role === "preparer" && (
        <div className="prep-steps" role="tablist" aria-label="Step">
          {PREPARER_STEPS.map(({ step: s, label, Icon }, index) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={step === s}
              className={`prep-steps__btn${step === s ? " prep-steps__btn--active" : ""}`}
              onClick={() => setPreparerStep(s)}
            >
              <span className="prep-steps__number">{index + 1}</span>
              <Icon size={19} />
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="prep-empty">
          <Loader2 size={22} className="refresh-button__icon--spinning" />
          Loading…
        </div>
      ) : loadError ? (
        <div className="prep-empty">
          <div className="form-error">{loadError}</div>
          <button type="button" className="prep-big-btn prep-big-btn--save" onClick={() => loadOrders()}>
            Retry
          </button>
        </div>
      ) : !day || !summary ? (
        <div className="prep-empty">{role === "driver" ? "Nothing sent yet" : "No orders"}</div>
      ) : (
        <>
          {days.length > 1 && (
            <div className="prep-days" role="tablist" aria-label="Day">
              {days.map((d) => {
                const info = amharicDay(d.date);
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
                    <span className="prep-day__label">
                      {info.icon} {info.label}
                    </span>
                    <span className="prep-day__meta">
                      {info.shortDate}
                      <Package size={12} strokeWidth={2.5} /> {d.orders.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="prep-summary">
            <div className="prep-summary__main">
              <span className="prep-summary__count">
                {summary.finishedCount}
                <span className="prep-summary__of">/{summary.orderCount}</span>
              </span>
              <span className="prep-summary__label">{SUMMARY_LABEL[step]}</span>
            </div>
            <div className="prep-progress prep-progress--summary" aria-hidden="true">
              <div
                className="prep-progress__bar prep-progress__bar--done"
                style={{ width: `${summary.orderCount ? (summary.finishedCount / summary.orderCount) * 100 : 0}%` }}
              />
            </div>
            {(summary.shortLineCount > 0 || (summary.conflictLineCount > 0 && step !== "prepared") || day.carriedOverCount > 0) && (
              <div className="prep-summary__chips">
                {summary.conflictLineCount > 0 && step !== "prepared" && (
                  <span className="prep-chip prep-chip--conflict">
                    <StatusIcon status="conflict" size={14} /> {summary.conflictLineCount}
                  </span>
                )}
                {summary.shortLineCount > 0 && (
                  <span className="prep-chip prep-chip--short">
                    <StatusIcon status="short" size={14} /> {summary.shortLineCount}
                  </span>
                )}
                {day.carriedOverCount > 0 && (
                  <span className="prep-chip" title="From an earlier day">
                    <CalendarClock size={14} strokeWidth={2.5} /> {day.carriedOverCount} late
                  </span>
                )}
              </div>
            )}
          </div>

          {role === "preparer" && (
            <div className="prep-toggle" role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === "customers"}
                className={`prep-toggle__btn${activeView === "customers" ? " prep-toggle__btn--active" : ""}`}
                onClick={() => setView("customers")}
              >
                <Users size={17} /> Customers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === "items"}
                className={`prep-toggle__btn${activeView === "items" ? " prep-toggle__btn--active" : ""}`}
                onClick={() => setView("items")}
              >
                <Package size={17} /> Items
              </button>
            </div>
          )}

          <StatusLegend step={step} />

          {saveError && (
            <div className="prep-error" role="alert">
              {saveError}
              <button type="button" className="prep-error__close" onClick={() => setSaveError(null)}>
                OK
              </button>
            </div>
          )}

          <div className="prep-list">
            {activeView === "customers"
              ? day.orders.map((order) => (
                  <PrepOrderCard
                    key={order.invoice_id}
                    order={order}
                    step={step}
                    isSaving={savingInvoiceIds.has(order.invoice_id)}
                    onEditLine={(line) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                    onCompleteRest={() => completeRest(order.line_items.map((line) => ({ order, line })))}
                  />
                ))
              : items.map((item) => (
                  <PrepItemCard
                    key={item.label}
                    item={item}
                    step={step}
                    isExpanded={expandedItems.has(item.label)}
                    isSaving={item.lines.some(({ order }) => savingInvoiceIds.has(order.invoice_id))}
                    onToggleExpanded={() => toggleExpanded(item.label)}
                    onEditLine={({ order, line }) => setEditing({ invoiceId: order.invoice_id, lineItemId: line.line_item_id })}
                    onCompleteRest={() => completeRest(item.lines)}
                  />
                ))}
          </div>
        </>
      )}

      {editingOrder && editingLine && (
        <StepQuantitySheet
          key={`${editingOrder.invoice_id}|${editingLine.line_item_id}|${step}`}
          order={editingOrder}
          line={editingLine}
          step={step}
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
