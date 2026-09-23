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
 */
export default function CustomerTags({ customer }: { customer: CustomFieldsHolder }) {
  const { city, district } = parseAddress(getRawContactAddress(customer));
  const businessType = getRawContactBusinessType(customer);
  const BusinessTypeIcon = businessType ? BUSINESS_TYPE_ICON[businessType] : null;

  if (!district && !city && !businessType) return null;

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
