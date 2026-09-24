import { Coffee, MapPin, ShoppingBasket, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { getRawContactAddress, getRawContactBusinessType, type BusinessType, type CustomFieldsHolder } from "../lib/api";
import { parseAddress } from "../lib/address";

/** Icon per business type, used on the business-type chip. */
const BUSINESS_TYPE_ICON: Record<BusinessType, LucideIcon> = {
  Grocery: ShoppingBasket,
  Restaurant: UtensilsCrossed,
  Roastry: Coffee,
};

/**
 * A customer's location (district · city) and business-type chips, read off
 * their custom fields. Renders nothing when neither is set.
 *
 * `compact` renders an inline, low-key version for dense lists (the Drafts
 * tab): the business type as a bare icon (named on hover) and just the
 * district (or city, if no district), meant to sit next to the customer name.
 */
export default function CustomerTags({ customer, compact = false }: { customer: CustomFieldsHolder; compact?: boolean }) {
  const { city, district } = parseAddress(getRawContactAddress(customer));
  const businessType = getRawContactBusinessType(customer);
  const BusinessTypeIcon = businessType ? BUSINESS_TYPE_ICON[businessType] : null;

  if (!district && !city && !businessType) return null;

  if (compact) {
    const place = district || city;
    return (
      <span className="customer-inline-tags">
        {businessType && BusinessTypeIcon && (
          <span
            className={`customer-inline-tags__type customer-inline-tags__type--${businessType.toLowerCase()}`}
            title={businessType}
            aria-label={businessType}
          >
            <BusinessTypeIcon size={13} />
          </span>
        )}
        {place && (
          <span className="customer-inline-tags__place" title={[district, city].filter(Boolean).join(", ")}>
            {place}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="customer-card__tags">
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
  );
}
