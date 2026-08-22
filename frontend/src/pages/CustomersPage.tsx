import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchCustomers } from "../lib/api";
import { currency } from "../lib/currency";
import { useSortState } from "../hooks/useSortState";
import ClickableCard from "../components/ClickableCard";
import SortRow from "../components/SortRow";
import RefreshButton from "../components/RefreshButton";
import type { Contact } from "../types";

type StatusFilter = "all" | "outstanding" | "settled";

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "settled", label: "Settled" },
];

type ActiveFilter = "active" | "inactive";

const ACTIVE_OPTIONS: { key: ActiveFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

type SortKey = "name" | "balance";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "balance", label: "Balance" },
];

/** Customer directory: search, filter by status/activity, and sort by name or balance. */
export default function CustomersPage({
  onSelectCustomer,
}: {
  onSelectCustomer: (customerId: string) => void;
}) {
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("balance", "desc");

  const loadCustomers = useCallback((options?: { force?: boolean }) => {
    return fetchCustomers(options).then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = customers.filter((c) => {
      const matchesQuery =
        !q ||
        (c.contact_name || "").toLowerCase().includes(q) ||
        (c.company_name || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "outstanding" && c.outstanding_receivable_amount > 0) ||
        (statusFilter === "settled" && c.outstanding_receivable_amount <= 0);
      const matchesActive =
        activeFilter === "active" ? c.status === "active" : c.status !== "active";
      return matchesQuery && matchesStatus && matchesActive;
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === "balance") {
        return direction * (a.outstanding_receivable_amount - b.outstanding_receivable_amount);
      }
      return direction * (a.contact_name || a.company_name).localeCompare(b.contact_name || b.company_name);
    });

    return list;
  }, [customers, query, statusFilter, activeFilter, sortKey, sortDirection]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <RefreshButton onRefresh={() => loadCustomers({ force: true })} />
      </div>
      <p className="page-subtitle">Outstanding balances from Zoho</p>

      <div className="search-field">
        <Search className="search-field__icon" size={16} />
        <input
          type="text"
          className="input search-field__input"
          placeholder="Search customers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="filter-columns">
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

        <div className="sort-row">
          {ACTIVE_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`pill${activeFilter === key ? " pill--active" : ""}`}
              onClick={() => setActiveFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SortRow
        options={SORT_OPTIONS}
        activeKey={sortKey}
        direction={sortDirection}
        onToggle={toggleSort}
        trailingText={`${filteredCustomers.length} customer${filteredCustomers.length === 1 ? "" : "s"}`}
      />

      <div className="draft-list">
        {filteredCustomers.length === 0 ? (
          <div className="items-area__empty">No customers found</div>
        ) : (
          filteredCustomers.map((c) => {
            const contactNumber = c.phone || c.mobile;
            const isInactive = c.status !== "active";
            return (
              <ClickableCard
                key={c.contact_id}
                className={isInactive ? "customer-card--inactive" : undefined}
                onClick={() => onSelectCustomer(c.contact_id)}
              >
                <div className="draft-card__top">
                  <span className="draft-card__invoice-number">
                    {c.contact_name || c.company_name}
                    {isInactive && <span className="badge customer-card__inactive-badge">inactive</span>}
                  </span>
                  <span className="draft-card__status">
                    {c.outstanding_receivable_amount > 0 ? "outstanding" : "settled"}
                  </span>
                </div>
                {c.company_name && c.company_name !== c.contact_name && (
                  <div className="draft-card__company">{c.company_name}</div>
                )}
                <div className="draft-card__bottom">
                  <span className="draft-card__scheduled">
                    {contactNumber || "No contact number"}
                  </span>
                  <span className="draft-card__total">
                    {currency(c.outstanding_receivable_amount)}
                  </span>
                </div>
              </ClickableCard>
            );
          })
        )}
      </div>
    </div>
  );
}
