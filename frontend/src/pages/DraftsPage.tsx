import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  fetchDraftInvoices,
  fetchInvoiceByIdCached,
  fetchRecentInvoices,
  fetchTodayEstimate,
  getRawContactAddress,
  invoiceCacheKey,
  type TodayEstimate,
} from "../lib/api";
import { invalidateCache } from "../lib/requestCache";
import { parseAddress } from "../lib/address";
import { currency } from "../lib/currency";
import { formatStatus } from "../lib/status";
import { describeScheduledDay, groupByScheduledDay } from "../lib/scheduledDate";
import { formatInvoicesForCopy } from "../lib/itemSummary";
import { useSortState } from "../hooks/useSortState";
import ResendButton from "../components/ResendButton";
import ClickableCard from "../components/ClickableCard";
import SortRow from "../components/SortRow";
import RefreshButton from "../components/RefreshButton";
import CopyButton from "../components/CopyButton";
import CustomerTags from "../components/CustomerTags";
import DayGroupHeader from "../components/DayGroupHeader";
import type { DraftInvoice } from "../types";

type SortKey = "invoice_number" | "customer" | "total" | "scheduled";
type DraftSortKey = Extract<SortKey, "invoice_number" | "customer">;
type ViewMode = "drafts" | "previous";
type StatusFilter = "all" | "paid" | "overdue" | "partially_paid";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "customer", label: "Customer" },
  { key: "total", label: "Total" },
  { key: "scheduled", label: "Scheduled" },
];

// Drafts are already sectioned by day, so only name/number sorts apply within each day.
const DRAFT_SORT_OPTIONS: { key: DraftSortKey; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "invoice_number", label: "Invoice #" },
];

const ALL_DISTRICTS = "all";

/** A draft's customer district, from the custom fields attached by the drafts endpoint ("" if unknown). */
function draftDistrict(draft: DraftInvoice): string {
  return parseAddress(getRawContactAddress({ custom_fields: draft.customer_custom_fields })).district;
}

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "partially_paid", label: "Partially Paid" },
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
  const [todayEstimate, setTodayEstimate] = useState<TodayEstimate | null>(null);
  const [previousTransactions, setPreviousTransactions] = useState<DraftInvoice[]>([]);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(true);
  const [previousError, setPreviousError] = useState<string | null>(null);
  const [previousQuery, setPreviousQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("scheduled");
  const draftSort = useSortState<DraftSortKey>("customer");
  const [districtFilter, setDistrictFilter] = useState(ALL_DISTRICTS);

  const loadDrafts = useCallback((options?: { force?: boolean }) => {
    return fetchDraftInvoices(options).then(setDrafts).catch(() => setDrafts([]));
  }, []);

  // Server-computed (and Redis-cached) so it never shrinks within the same
  // business day just because a draft got paid/sent — see fetchTodayEstimate.
  // Always refetched fresh: it reflects payments recorded anywhere in the
  // app, not just from this tab.
  const loadTodayEstimate = useCallback(() => {
    return fetchTodayEstimate().then(setTodayEstimate).catch(() => {});
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
    return Promise.all([loadDrafts({ force: true }), loadTodayEstimate()]);
  }

  useEffect(() => {
    loadDrafts();
    loadTodayEstimate();
    loadPreviousTransactions();
  }, [loadDrafts, loadTodayEstimate, loadPreviousTransactions]);

  function handleResent(invoiceId: string, date: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.invoice_id === invoiceId ? { ...d, date } : d)),
    );
  }

  const direction = sortDirection === "asc" ? 1 : -1;

  // Districts present among the current drafts, most drafts first, then alphabetical.
  const districtOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const draft of drafts) {
      const district = draftDistrict(draft);
      if (district) counts.set(district, (counts.get(district) ?? 0) + 1);
    }
    return Array.from(counts.keys()).sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  }, [drafts]);

  // Drop a stale selection (e.g. its last draft got sent) instead of showing an empty list.
  const activeDistrict = districtOptions.includes(districtFilter) ? districtFilter : ALL_DISTRICTS;

  const sortedDrafts = useMemo(() => {
    const filtered =
      activeDistrict === ALL_DISTRICTS ? drafts : drafts.filter((draft) => draftDistrict(draft) === activeDistrict);
    return sortInvoices(filtered, draftSort.sortKey, draftSort.sortDirection === "asc" ? 1 : -1);
  }, [drafts, activeDistrict, draftSort.sortKey, draftSort.sortDirection]);

  // Sections by the day each draft is due to go out. A draft whose date has
  // already passed but is still unsent is shown under today, flagged past
  // due — its actual date in Zoho is left alone. The chosen sort (and
  // district filter) apply within each day; days always run earliest first.
  const draftDayGroups = useMemo(() => groupByScheduledDay(sortedDrafts, (d) => d.date), [sortedDrafts]);

  const filteredPreviousTransactions = useMemo(() => {
    const q = previousQuery.trim().toLowerCase();
    const filtered = previousTransactions.filter((inv) => {
      const matchesQuery =
        !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.company_name || "").toLowerCase().includes(q) ||
        (inv.customer_name || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
    return sortInvoices(filtered, sortKey, direction);
  }, [previousTransactions, previousQuery, statusFilter, sortKey, direction]);

  function copyText() {
    const displayed = draftDayGroups.flatMap((group) => group.entries.map((entry) => entry.value));
    return Promise.all(displayed.map((draft) => fetchInvoiceByIdCached(draft.invoice_id))).then(
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
          {todayEstimate && (
            // Today's total includes past-due drafts (they're shown under
            // today), with that share called out in brackets.
            <div className="estimate-line">
              <div>
                Today <strong>{currency(todayEstimate.estimatedTotal + (todayEstimate.pastDueTotal ?? 0))}</strong>
                {!!todayEstimate.pastDueTotal && (
                  <span className="estimate-line__past-due"> ({currency(todayEstimate.pastDueTotal)} past due)</span>
                )}
              </div>
              <div>
                Collected <strong>{currency(todayEstimate.collectedToday)}</strong>
              </div>
            </div>
          )}

          <p className="page-subtitle">
            {activeDistrict === ALL_DISTRICTS
              ? `${drafts.length} draft${drafts.length === 1 ? "" : "s"}`
              : `${sortedDrafts.length} of ${drafts.length} drafts`}
          </p>

          <SortRow
            options={DRAFT_SORT_OPTIONS}
            activeKey={draftSort.sortKey}
            direction={draftSort.sortDirection}
            onToggle={draftSort.toggleSort}
            trailing={
              districtOptions.length > 0 ? (
                <div className="select-wrap">
                  <select
                    className="select select--sort"
                    value={activeDistrict}
                    onChange={(e) => setDistrictFilter(e.target.value)}
                    aria-label="Filter by district"
                  >
                    <option value={ALL_DISTRICTS}>All districts</option>
                    {districtOptions.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="select-wrap__chevron" size={16} />
                </div>
              ) : undefined
            }
          />

          {sortedDrafts.length === 0 ? (
            <div className="draft-list">
              <div className="items-area__empty">
                {drafts.length === 0 ? "No draft invoices" : "No drafts in this district"}
              </div>
            </div>
          ) : (
            draftDayGroups.map((group) => (
              <section key={group.date ?? "unscheduled"} className="day-group">
                <DayGroupHeader
                  date={group.date}
                  count={group.entries.length}
                  noun="draft"
                  carriedOverCount={group.entries.filter((e) => e.isCarriedOver).length}
                />
                <div className="draft-list">
                  {group.entries.map(({ value: invoice, isCarriedOver }) => {
                    const scheduled = invoice.date ? describeScheduledDay(invoice.date) : null;
                    return (
                      <ClickableCard key={invoice.invoice_id} onClick={() => onSelectInvoice(invoice.invoice_id)}>
                        <div className="draft-card__top">
                          <span className="draft-card__invoice-number">{invoice.invoice_number}</span>
                          <div className="draft-card__top-right" onClick={(e) => e.stopPropagation()}>
                            <span className="draft-card__status">{formatStatus(invoice.status)}</span>
                            <ResendButton
                              invoiceId={invoice.invoice_id}
                              currentDate={invoice.date}
                              onResent={(date) => handleResent(invoice.invoice_id, date)}
                            />
                          </div>
                        </div>
                        <div className="draft-card__company draft-card__company--with-tags">
                          <span className="draft-card__company-name">{invoice.company_name || invoice.customer_name}</span>
                          {invoice.customer_custom_fields && (
                            <CustomerTags customer={{ custom_fields: invoice.customer_custom_fields }} compact />
                          )}
                        </div>
                        <div className="draft-card__bottom">
                          {/* The day section already names the date; only a past-due draft shows its own. */}
                          {isCarriedOver && scheduled ? (
                            <span
                              className="draft-card__scheduled draft-card__scheduled--past-due"
                              title={`Past due — originally scheduled ${scheduled.formattedDate}`}
                            >
                              <span className="draft-card__overdue-dot" aria-hidden="true" />
                              {scheduled.label.toLowerCase()} {scheduled.formattedDate}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span className="draft-card__total">{currency(invoice.total)}</span>
                        </div>
                      </ClickableCard>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      ) : (
        <>
          <p className="previous-tx-hint">Last 30 days</p>

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

          <div className="sort-row">
            {STATUS_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`pill${statusFilter === key ? " pill--active" : ""}`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
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
                    <span className="draft-card__status">{formatStatus(invoice.status)}</span>
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
