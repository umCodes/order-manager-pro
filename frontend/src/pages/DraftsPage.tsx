import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDraftInvoices, fetchInvoiceByIdCached, invoiceCacheKey } from "../lib/api";
import { invalidateCache } from "../lib/requestCache";
import { currency } from "../lib/currency";
import { describeScheduledDay } from "../lib/scheduledDate";
import { formatInvoicesForCopy } from "../lib/itemSummary";
import { useSortState } from "../hooks/useSortState";
import ResendButton from "../components/ResendButton";
import ClickableCard from "../components/ClickableCard";
import SortRow from "../components/SortRow";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import type { DraftInvoice, InvoiceDetail } from "../types";

type SortKey = "invoice_number" | "customer" | "total" | "scheduled";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "customer", label: "Customer" },
  { key: "total", label: "Total" },
  { key: "scheduled", label: "Scheduled" },
];

/** List of draft invoices awaiting scheduling/sending, sortable by any column. */
export default function DraftsPage({
  onSelectInvoice,
}: {
  onSelectInvoice: (invoiceId: string) => void;
}) {
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [detailsById, setDetailsById] = useState<Map<string, InvoiceDetail>>(new Map());
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("scheduled");

  const loadDrafts = useCallback((options?: { force?: boolean }) => {
    return fetchDraftInvoices(options).then(setDrafts).catch(() => setDrafts([]));
  }, []);

  function refreshDrafts() {
    for (const draft of drafts) invalidateCache(invoiceCacheKey(draft.invoice_id));
    setDetailsById(new Map());
    return loadDrafts({ force: true });
  }

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Prefetch each draft's line items in the background as soon as the list
  // loads (rather than on click) so the Copy button can write to the
  // clipboard synchronously — mobile browsers (notably iOS Safari) revoke
  // clipboard-write permission for a tap once an async gap, like a network
  // fetch, comes between the tap and the write.
  useEffect(() => {
    const missing = drafts.filter((draft) => !detailsById.has(draft.invoice_id));
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(missing.map((draft) => fetchInvoiceByIdCached(draft.invoice_id)))
      .then((details) => {
        if (cancelled) return;
        setDetailsById((prev) => {
          const next = new Map(prev);
          for (const detail of details) next.set(detail.invoice_id, detail);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  function handleResent(invoiceId: string, date: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.invoice_id === invoiceId ? { ...d, date } : d)),
    );
  }

  const sortedDrafts = useMemo(() => {
    const list = [...drafts];
    const direction = sortDirection === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "invoice_number":
          return direction * a.invoice_number.localeCompare(b.invoice_number);
        case "customer":
          return direction * (a.company_name || a.customer_name).localeCompare(b.company_name || b.customer_name);
        case "total":
          return direction * (a.total - b.total);
        case "scheduled":
          return direction * (a.date || "").localeCompare(b.date || "");
      }
    });
    return list;
  }, [drafts, sortKey, sortDirection]);

  const copyText = useMemo(() => {
    const details = sortedDrafts
      .map((draft) => detailsById.get(draft.invoice_id))
      .filter((detail): detail is InvoiceDetail => detail !== undefined);
    return formatInvoicesForCopy(details);
  }, [sortedDrafts, detailsById]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Draft Invoices</h1>
        <div className="page-header__actions">
          <CopyButton getText={() => copyText} />
          <RefreshButton onRefresh={refreshDrafts} />
        </div>
      </div>
      <p className="page-subtitle">
        {drafts.length} draft{drafts.length === 1 ? "" : "s"}
      </p>

      <SortRow options={SORT_OPTIONS} activeKey={sortKey} direction={sortDirection} onToggle={toggleSort} />

      <div className="draft-list">
        {sortedDrafts.length === 0 ? (
          <div className="items-area__empty">No draft invoices</div>
        ) : (
          sortedDrafts.map((invoice) => {
            const scheduled = invoice.date ? describeScheduledDay(invoice.date) : null;
            return (
              <ClickableCard key={invoice.invoice_id} onClick={() => onSelectInvoice(invoice.invoice_id)}>
                <div className="draft-card__top">
                  <span className="draft-card__invoice-number">{invoice.invoice_number}</span>
                  <div className="draft-card__top-right" onClick={(e) => e.stopPropagation()}>
                    <span className="draft-card__status">{invoice.status}</span>
                    <ResendButton
                      invoiceId={invoice.invoice_id}
                      currentDate={invoice.date}
                      onResent={(date) => handleResent(invoice.invoice_id, date)}
                    />
                  </div>
                </div>
                <div className="draft-card__company">{invoice.company_name || invoice.customer_name}</div>
                <div className="draft-card__bottom">
                  {scheduled && (
                    <span className="draft-card__scheduled">
                      {scheduled.isPast && (
                        <span className="draft-card__overdue-dot" aria-label="Overdue" title="Overdue" />
                      )}
                      {scheduled.label.toLowerCase()} {scheduled.formattedDate}
                    </span>
                  )}
                  <span className="draft-card__total">{currency(invoice.total)}</span>
                </div>
              </ClickableCard>
            );
          })
        )}
      </div>
    </div>
  );
}
