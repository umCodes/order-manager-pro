import { useMemo, useState } from "react";
import { Coffee, MapPin, Plus, Search, ShoppingBasket, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { getRawContactAddress, getRawContactBusinessType, type BusinessType } from "../lib/api";
import { parseAddress } from "../lib/address";
import { getPrimaryContactPhone } from "../lib/contacts";
import type { Contact } from "../types";

const BUSINESS_TYPE_ICON: Record<BusinessType, LucideIcon> = {
  Grocery: ShoppingBasket,
  Restaurant: UtensilsCrossed,
  Roastry: Coffee,
};

type Props = {
  customers: Contact[];
  isLoading: boolean;
  error: string | null;
  onSelect: (customer: Contact) => void;
  onAddNew: () => void;
};

/** Customer search/list — the entry screen: find an existing customer to edit, or add a new one. */
export default function CustomerListView({ customers, isLoading, error, onSelect, onAddNew }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.contact_name || "").toLowerCase().includes(q) ||
        (c.company_name || "").toLowerCase().includes(q) ||
        getPrimaryContactPhone(c)?.includes(q),
    );
  }, [customers, query]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
      </div>
      <p className="page-subtitle">Add or edit a customer's info</p>

      <div className="search-field">
        <Search className="search-field__icon" size={18} />
        <input
          type="text"
          className="input search-field__input"
          placeholder="Search by name, company, or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {error && <div className="form-error">{error}</div>}

      {isLoading ? (
        <div className="empty-state">Loading customers…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">{query ? "No matching customers" : "No customers yet — add the first one"}</div>
      ) : (
        <div className="customer-row-list">
          {filtered.map((c) => {
            const { city, district } = parseAddress(getRawContactAddress(c));
            const businessType = getRawContactBusinessType(c);
            const BusinessTypeIcon = businessType ? BUSINESS_TYPE_ICON[businessType] : null;
            const phone = getPrimaryContactPhone(c);
            return (
              <button key={c.contact_id} type="button" className="customer-row" onClick={() => onSelect(c)}>
                <div className="customer-row__name">{c.contact_name || c.company_name}</div>
                {c.company_name && c.company_name !== c.contact_name && (
                  <div className="customer-row__company">{c.company_name}</div>
                )}
                {(district || city || businessType) && (
                  <div className="customer-row__tags">
                    {(district || city) && (
                      <span className="location-chip">
                        <MapPin className="location-chip__icon" size={11} />
                        {district ? (
                          <>
                            <span className="location-chip__district">{district}</span>
                            {city && (
                              <>
                                <span className="location-chip__divider">·</span>
                                <span className="location-chip__city">{city}</span>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="location-chip__district">{city}</span>
                        )}
                      </span>
                    )}
                    {businessType && BusinessTypeIcon && (
                      <span className={`business-type-chip business-type-chip--${businessType.toLowerCase()}`}>
                        <BusinessTypeIcon size={11} />
                        {businessType}
                      </span>
                    )}
                  </div>
                )}
                <div className="customer-row__phone">{phone || "No phone on file"}</div>
              </button>
            );
          })}
        </div>
      )}

      <button type="button" className="fab" onClick={onAddNew} aria-label="Add new customer" title="Add new customer">
        <Plus size={26} />
      </button>
    </div>
  );
}
