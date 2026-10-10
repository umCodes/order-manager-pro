import { useCallback, useEffect, useState } from "react";
import { fetchPrepOrders, savePrepStep } from "../lib/api";
import type { PrepLineItem, PrepOrder } from "../types";

export type PreparedChange = { line_item_id: string; quantity: number };

export type PrepOrdersState = ReturnType<typeof usePrepOrders>;

/**
 * The drafts and their recorded prepared amounts, shared by the preparation
 * app's tabs (Prepare and Items work on the same data). Saves show right
 * away and are put back if the server refuses them.
 */
export function usePrepOrders() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

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

  function updateLines(invoiceId: string, update: (line: PrepLineItem) => PrepLineItem) {
    setOrders((prev) =>
      prev.map((order) => (order.invoice_id !== invoiceId ? order : { ...order, line_items: order.line_items.map(update) })),
    );
  }

  /** Saves prepared amounts for some lines of one order. */
  function savePrepared(invoiceId: string, changes: PreparedChange[]) {
    if (changes.length === 0) return;
    const before = orders.find((o) => o.invoice_id === invoiceId);
    const changed = new Map(changes.map((c) => [c.line_item_id, c.quantity]));
    updateLines(invoiceId, (line) =>
      changed.has(line.line_item_id) ? { ...line, prepared: changed.get(line.line_item_id) ?? line.prepared } : line,
    );
    setSaveError(null);
    setSavingIds((prev) => new Set(prev).add(invoiceId));

    savePrepStep(invoiceId, "prepared", changes)
      .then((saved) =>
        updateLines(invoiceId, (line) =>
          changed.has(line.line_item_id) ? { ...line, prepared: saved[line.line_item_id]?.prepared ?? null } : line,
        ),
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

  return {
    orders,
    isLoading,
    loadError,
    loadOrders,
    saveError,
    clearSaveError: () => setSaveError(null),
    savingIds,
    savePrepared,
  };
}
