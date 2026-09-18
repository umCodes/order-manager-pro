import { useMemo, useState } from "react";
import { Coffee, ExternalLink, MapPin, Plus, Search, ShoppingBasket, UtensilsCrossed, type LucideIcon } from "lucide-react";
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
  selectedCustomerId: string | undefined;
  onSelect: (customer: Contact) => void;
  onAddNew: () => void;
};

/**
 * Customer search/list. On desktop this is the permanent left-hand pane of
 * a master-detail layout, so it highlights whichever customer the detail
 * pane is currently showing; on mobile it's the whole screen until a
 * customer is picked.
 */
export default function CustomerListView({ customers, isLoading, error, selectedCustomerId, onSelect, onAddNew }: Props) {
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
      <div className="list-header">
        <h1 className="page-title">Customers</h1>
        <button type="button" className="btn btn--primary btn--icon-label" onClick={onAddNew}>
          <Plus size={16} />
          New Customer
        </button>
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
            const { city, district, locationLink } = parseAddress(getRawContactAddress(c));
            const businessType = getRawContactBusinessType(c);
            const BusinessTypeIcon = businessType ? BUSINESS_TYPE_ICON[businessType] : null;
            const phone = getPrimaryContactPhone(c);
            return (
              <button
                key={c.contact_id}
                type="button"
                className={`customer-row${c.contact_id === selectedCustomerId ? " customer-row--active" : ""}`}
                onClick={() => onSelect(c)}
              >
                <div className="customer-row__name">{c.contact_name || c.company_name}</div>
                {c.company_name && c.company_name !== c.contact_name && (
                  <div className="customer-row__company">{c.company_name}</div>
                )}
                {(district || city || businessType || locationLink) && (
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
                    {locationLink && (
                      // Not a real <a> — this row is already a <button>, and interactive
                      // content can't validly nest inside one — so it's a keyboard-
                      // reachable span that opens the link itself, stopping the click
                      // from also triggering the row's onSelect.
                      <span
                        role="link"
                        tabIndex={0}
                        className="maps-link-icon"
                        title="Open in Google Maps"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(locationLink, "_blank", "noopener,noreferrer");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(locationLink, "_blank", "noopener,noreferrer");
                          }
                        }}
                      >
                        <ExternalLink size={12} />
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
    </div>
  );
}
