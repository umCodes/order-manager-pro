import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchDraftInvoices, fetchInvoiceByIdCached, fetchRecentInvoices, invoiceCacheKey } from "../lib/api";
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
import type { DraftInvoice } from "../types";

type SortKey = "invoice_number" | "customer" | "total" | "scheduled";
type ViewMode = "drafts" | "previous";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "customer", label: "Customer" },
  { key: "total", label: "Total" },
  { key: "scheduled", label: "Scheduled" },
];

function sortInvoices(list: DraftInvoice[], sortKey: SortKey, direction: 1 | -1): DraftInvoice[] {
  const copy = [...list];
  copy.sort((a, b) => {
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
  return copy;
}

/**
 * Drafts awaiting scheduling/sending, or — via the toggle at the top —
 * finalized invoices (sent/paid/overdue, never draft) from the last 30
 * days. The latter is fetched in full up front (no pagination): opening one
 * shows it read-only except for recording a payment against it.
 */
export default function DraftsPage({
  onSelectInvoice,
}: {
  onSelectInvoice: (invoiceId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("drafts");
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [previousTransactions, setPreviousTransactions] = useState<DraftInvoice[]>([]);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(true);
  const [previousError, setPreviousError] = useState<string | null>(null);
  const [previousQuery, setPreviousQuery] = useState("");
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("scheduled");

  const loadDrafts = useCallback((options?: { force?: boolean }) => {
    return fetchDraftInvoices(options).then(setDrafts).catch(() => setDrafts([]));
  }, []);

  const loadPreviousTransactions = useCallback(() => {
    return fetchRecentInvoices()
      .then((data) => {
        setPreviousTransactions(data);
        setPreviousError(null);
      })
      .catch((e) => setPreviousError(e instanceof Error ? e.message : "Failed to load previous transactions"))
      .finally(() => setIsLoadingPrevious(false));
  }, []);

  function refreshDrafts() {
    for (const draft of drafts) invalidateCache(invoiceCacheKey(draft.invoice_id));
    return loadDrafts({ force: true });
  }

  useEffect(() => {
    loadDrafts();
    loadPreviousTransactions();
  }, [loadDrafts, loadPreviousTransactions]);

  function handleResent(invoiceId: string, date: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.invoice_id === invoiceId ? { ...d, date } : d)),
    );
  }

  const direction = sortDirection === "asc" ? 1 : -1;

  const sortedDrafts = useMemo(() => sortInvoices(drafts, sortKey, direction), [drafts, sortKey, direction]);

  const filteredPreviousTransactions = useMemo(() => {
    const q = previousQuery.trim().toLowerCase();
    const filtered = !q
      ? previousTransactions
      : previousTransactions.filter(
          (inv) =>
            inv.invoice_number.toLowerCase().includes(q) ||
            (inv.company_name || "").toLowerCase().includes(q) ||
            (inv.customer_name || "").toLowerCase().includes(q),
        );
    return sortInvoices(filtered, sortKey, direction);
  }, [previousTransactions, previousQuery, sortKey, direction]);

  function copyText() {
    return Promise.all(sortedDrafts.map((draft) => fetchInvoiceByIdCached(draft.invoice_id))).then(
      formatInvoicesForCopy,
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{viewMode === "drafts" ? "Draft Invoices" : "Previous Transactions"}</h1>
        <div className="page-header__actions">
          {viewMode === "drafts" ? (
            <>
              <CopyButton getText={copyText} />
              <RefreshButton onRefresh={refreshDrafts} />
            </>
          ) : (
            <RefreshButton onRefresh={loadPreviousTransactions} />
          )}
        </div>
      </div>

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle__option${viewMode === "drafts" ? " mode-toggle__option--active" : ""}`}
          onClick={() => setViewMode("drafts")}
        >
          Drafts
        </button>
        <button
          type="button"
          className={`mode-toggle__option${viewMode === "previous" ? " mode-toggle__option--active" : ""}`}
          onClick={() => setViewMode("previous")}
        >
          Previous Transactions
        </button>
      </div>

      {viewMode === "drafts" ? (
        <>
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
        </>
      ) : (
        <>
          <p className="page-subtitle">Sent, paid, or overdue invoices from the last 30 days — view only, but you can record a payment</p>

          <div className="search-field">
            <Search className="search-field__icon" size={16} />
            <input
              type="text"
              className="input search-field__input"
              placeholder="Search by invoice # or customer"
              value={previousQuery}
              onChange={(e) => setPreviousQuery(e.target.value)}
            />
          </div>

          <SortRow
            options={SORT_OPTIONS}
            activeKey={sortKey}
            direction={sortDirection}
            onToggle={toggleSort}
            trailingText={`${filteredPreviousTransactions.length} transaction${filteredPreviousTransactions.length === 1 ? "" : "s"}`}
          />

          {previousError && <div className="form-error">{previousError}</div>}

          <div className="draft-list">
            {isLoadingPrevious ? (
              <div className="items-area__empty">Loading…</div>
            ) : filteredPreviousTransactions.length === 0 ? (
              <div className="items-area__empty">No previous transactions found</div>
            ) : (
              filteredPreviousTransactions.map((invoice) => (
                <ClickableCard key={invoice.invoice_id} onClick={() => onSelectInvoice(invoice.invoice_id)}>
                  <div className="draft-card__top">
                    <span className="draft-card__invoice-number">{invoice.invoice_number}</span>
                    <span className="draft-card__status">{invoice.status}</span>
                  </div>
                  <div className="draft-card__company">{invoice.company_name || invoice.customer_name}</div>
                  <div className="draft-card__bottom">
                    <span className="draft-card__scheduled">{invoice.date}</span>
                    <span className="draft-card__total">{currency(invoice.total)}</span>
                  </div>
                </ClickableCard>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
