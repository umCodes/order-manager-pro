import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Search,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import {
  fetchCustomers,
  getRawContactPreferredLanguage,
  getRawContactAddress,
  getRawContactBusinessType,
  type BusinessType,
} from "../lib/api";
import { parseAddress } from "../lib/address";
import { getPrimaryContactPhone } from "../lib/contacts";
import { currency } from "../lib/currency";
import { useSortState } from "../hooks/useSortState";
import ClickableCard from "../components/ClickableCard";
import RefreshButton from "../components/RefreshButton";
import AddCustomerModal from "../components/AddCustomerModal";
import CustomerTags from "../components/CustomerTags";
import type { Contact } from "../types";

type StatusFilter = "all" | "outstanding" | "settled";
type ActiveFilter = "active" | "inactive";
type BusinessTypeFilter = BusinessType | "all";
type DataFilter = "all" | "noPhone" | "noAddress" | "noBusinessType" | "noLanguage";

type SortKey = "balance" | "name" | "district" | "city" | "businessType";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "balance", label: "Balance" },
  { key: "name", label: "Name" },
  { key: "district", label: "District" },
  { key: "city", label: "City" },
  { key: "businessType", label: "Business type" },
];

const BUSINESS_TYPES: BusinessType[] = ["Grocery", "Restaurant", "Roastry"];

const DATA_FILTER_OPTIONS: { key: Exclude<DataFilter, "all">; label: string }[] = [
  { key: "noPhone", label: "No phone" },
  { key: "noAddress", label: "No address" },
  { key: "noBusinessType", label: "Unlabeled" },
  { key: "noLanguage", label: "No language" },
];

/** Sorts values already ranked most-to-least common, falling back to alphabetical among ties. */
function rankedOptions(customers: Contact[], pick: (c: Contact) => string | undefined): string[] {
  const counts = new Map<string, number>();
  for (const customer of customers) {
    const value = pick(customer);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
}

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
  const [businessTypeFilter, setBusinessTypeFilter] = useState<BusinessTypeFilter>("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const { sortKey, sortDirection, toggleSort } = useSortState<SortKey>("balance", "desc");

  // "All" and "Active" are the implicit defaults — toggling one of the pills
  // below switches to it, tapping the already-active one switches back off.
  function toggleStatusFilter(target: Exclude<StatusFilter, "all">) {
    setStatusFilter((prev) => (prev === target ? "all" : target));
  }
  function toggleActiveFilter() {
    setActiveFilter((prev) => (prev === "inactive" ? "active" : "inactive"));
  }
  function toggleBusinessTypeFilter(target: BusinessType) {
    setBusinessTypeFilter((prev) => (prev === target ? "all" : target));
  }
  function toggleDataFilter(target: Exclude<DataFilter, "all">) {
    setDataFilter((prev) => (prev === target ? "all" : target));
  }

  const loadCustomers = useCallback((options?: { force?: boolean }) => {
    return fetchCustomers(options).then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Only cities/districts an actual customer has, ranked most-common first —
  // a filter dropdown listing every possible city/district would mostly be
  // dead options.
  const cityOptions = useMemo(
    () => rankedOptions(customers, (c) => parseAddress(getRawContactAddress(c)).city || undefined),
    [customers],
  );
  const districtOptions = useMemo(
    () => rankedOptions(customers, (c) => parseAddress(getRawContactAddress(c)).district || undefined),
    [customers],
  );
  const advancedFilterCount = [
    businessTypeFilter !== "all",
    cityFilter !== "all",
    districtFilter !== "all",
    dataFilter !== "all",
  ].filter(Boolean).length;

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
      const matchesBusinessType =
        businessTypeFilter === "all" || getRawContactBusinessType(c) === businessTypeFilter;
      const address = parseAddress(getRawContactAddress(c));
      const matchesCity = cityFilter === "all" || address.city === cityFilter;
      const matchesDistrict = districtFilter === "all" || address.district === districtFilter;
      const matchesData =
        dataFilter === "all" ||
        (dataFilter === "noPhone" && !getPrimaryContactPhone(c)) ||
        (dataFilter === "noAddress" && !getRawContactAddress(c)) ||
        (dataFilter === "noBusinessType" && !getRawContactBusinessType(c)) ||
        // Only flag a missing language if the list response actually carries
        // custom_fields at all — otherwise every customer would falsely match.
        (dataFilter === "noLanguage" && !!c.custom_fields?.length && getRawContactPreferredLanguage(c) === undefined);
      return (
        matchesQuery &&
        matchesStatus &&
        matchesActive &&
        matchesBusinessType &&
        matchesCity &&
        matchesDistrict &&
        matchesData
      );
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === "balance") {
        return direction * (a.outstanding_receivable_amount - b.outstanding_receivable_amount);
      }
      if (sortKey === "district" || sortKey === "city") {
        const aValue = parseAddress(getRawContactAddress(a))[sortKey];
        const bValue = parseAddress(getRawContactAddress(b))[sortKey];
        return direction * aValue.localeCompare(bValue);
      }
      if (sortKey === "businessType") {
        const aValue = getRawContactBusinessType(a) ?? "";
        const bValue = getRawContactBusinessType(b) ?? "";
        return direction * aValue.localeCompare(bValue);
      }
      return direction * (a.contact_name || a.company_name).localeCompare(b.contact_name || b.company_name);
    });

    return list;
  }, [
    customers,
    query,
    statusFilter,
    activeFilter,
    businessTypeFilter,
    cityFilter,
    districtFilter,
    dataFilter,
    sortKey,
    sortDirection,
  ]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <div className="page-header__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setIsAddCustomerOpen(true)}
            aria-label="Add customer"
            title="Add customer"
          >
            <UserPlus size={16} />
          </button>
          <RefreshButton onRefresh={() => loadCustomers({ force: true })} />
        </div>
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

      <div className="sort-row sort-row--with-count">
        <div className="sort-row__pills">
          <button
            type="button"
            className={`pill${statusFilter === "outstanding" ? " pill--active" : ""}`}
            onClick={() => toggleStatusFilter("outstanding")}
          >
            Outstanding
          </button>
          <button
            type="button"
            className={`pill${statusFilter === "settled" ? " pill--active" : ""}`}
            onClick={() => toggleStatusFilter("settled")}
          >
            Settled
          </button>
        </div>
        <button
          type="button"
          className={`pill${activeFilter === "inactive" ? " pill--active" : ""}`}
          onClick={toggleActiveFilter}
        >
          Inactive
        </button>
      </div>

      <button
        type="button"
        className={`filters-toggle${isMoreFiltersOpen ? " filters-toggle--open" : ""}`}
        onClick={() => setIsMoreFiltersOpen((open) => !open)}
      >
        <SlidersHorizontal size={13} />
        More filters
        {advancedFilterCount > 0 && <span className="filters-toggle__count">{advancedFilterCount}</span>}
        <ChevronDown className="filters-toggle__chevron" size={14} />
      </button>

      {isMoreFiltersOpen && (
        <div className="filters-panel">
          <div className="field">
            <label className="field-label">Business type</label>
            <div className="day-pill-row">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`pill${businessTypeFilter === type ? " pill--active" : ""}`}
                  onClick={() => toggleBusinessTypeFilter(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="filters-panel__row">
            <div className="field">
              <label className="field-label" htmlFor="city-filter">
                City
              </label>
              <div className="select-wrap">
                <select
                  id="city-filter"
                  className="select"
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                >
                  <option value="all">All cities</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
                <ChevronDown className="select-wrap__chevron" size={16} />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="district-filter">
                District
              </label>
              <div className="select-wrap">
                <select
                  id="district-filter"
                  className="select"
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                >
                  <option value="all">All districts</option>
                  {districtOptions.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
                <ChevronDown className="select-wrap__chevron" size={16} />
              </div>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Missing info</label>
            <div className="day-pill-row">
              {DATA_FILTER_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`pill${dataFilter === key ? " pill--active" : ""}`}
                  onClick={() => toggleDataFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="sort-row sort-row--with-count">
        <div className="sort-select-group">
          <div className="select-wrap">
            <select
              className="select select--sort"
              value={sortKey}
              onChange={(e) => toggleSort(e.target.value as SortKey)}
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="select-wrap__chevron" size={16} />
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => toggleSort(sortKey)}
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
            title={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
          >
            {sortDirection === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
          </button>
        </div>
        <span className="sort-row__count">
          {filteredCustomers.length} customer{filteredCustomers.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="draft-list">
        {filteredCustomers.length === 0 ? (
          <div className="items-area__empty">No customers found</div>
        ) : (
          filteredCustomers.map((c) => {
            const contactNumber = getPrimaryContactPhone(c);
            const isInactive = c.status !== "active";
            const hasNoPhone = !contactNumber;
            // Only flag a missing language if the list response actually carries
            // custom_fields at all — otherwise every customer would falsely show as missing.
            const hasNoPreferredLanguage = !!c.custom_fields?.length && getRawContactPreferredLanguage(c) === undefined;
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
                    {hasNoPhone && (
                      <span className="badge badge--warning customer-card__inactive-badge" title="No phone number on file">
                        no phone
                      </span>
                    )}
                    {hasNoPreferredLanguage && (
                      <span className="badge badge--warning customer-card__inactive-badge" title="No preferred language set">
                        no language
                      </span>
                    )}
                  </span>
                  <span className="draft-card__status">
                    {c.outstanding_receivable_amount > 0 ? "outstanding" : "settled"}
                  </span>
                </div>
                {c.company_name && c.company_name !== c.contact_name && (
                  <div className="draft-card__company">{c.company_name}</div>
                )}
                <CustomerTags customer={c} />
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

      <AddCustomerModal
        open={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSaved={() => loadCustomers({ force: true })}
      />
    </div>
  );
}
