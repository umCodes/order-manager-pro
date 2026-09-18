import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  createCustomer,
  updateCustomer,
  fetchCustomers,
  getContactPreferredLanguage,
  getRawContactAddress,
  getRawContactBusinessType,
  type CustomerType,
  type PreferredLanguage,
  type BusinessType,
} from "../lib/api";
import { SAUDI_CITIES, buildDistrictOptions, parseAddress } from "../lib/address";
import type { Contact } from "../types";

type Props = {
  open: boolean;
  /** When set, the form edits this contact instead of creating a new one, pre-filled with its current values. */
  customer?: Contact | null;
  onClose: () => void;
  onSaved: (customer: Contact) => void;
};

const CUSTOMER_TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "individual", label: "Individual" },
];

const LANGUAGE_OPTIONS: { value: PreferredLanguage; label: string }[] = [
  { value: "am", label: "Amharic" },
  { value: "ar", label: "Arabic" },
  { value: "en", label: "English" },
];

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "Grocery", label: "Grocery" },
  { value: "Restaurant", label: "Restaurant" },
  { value: "Roastry", label: "Roastry" },
];

function isCustomerType(value: string | undefined): value is CustomerType {
  return value === "business" || value === "individual";
}

/**
 * Full-screen form for creating or editing a Zoho contact. Remounted (via
 * `key`) each time it opens so its fields always start fresh — pre-filled
 * from `customer` when editing, defaulting to "business"/"am" when a
 * selectable field has no current value (new contact, or missing on an
 * existing one).
 */
export default function AddCustomerModal({ open, customer, onClose, onSaved }: Props) {
  return (
    <div className={`sheet-overlay${open ? " sheet-overlay--open" : ""}`}>
      <div className="sheet-overlay__backdrop" onClick={onClose} />
      <div className="sheet-anchor">
        <div className={`sheet sheet--full${open ? " sheet--open" : ""}`}>
          <SheetContent key={String(open)} customer={customer} onClose={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}

type SheetContentProps = Omit<Props, "open">;

function SheetContent({ customer, onClose, onSaved }: SheetContentProps) {
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [phone, setPhone] = useState(
    customer?.contact_persons?.[0]?.phone || customer?.phone || customer?.mobile || "",
  );
  const [customerType, setCustomerType] = useState<CustomerType>(
    isCustomerType(customer?.customer_sub_type) ? customer.customer_sub_type : "business",
  );
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>(
    customer ? getContactPreferredLanguage(customer) : "am",
  );
  const existingAddress = customer ? parseAddress(getRawContactAddress(customer)) : undefined;
  const [businessType, setBusinessType] = useState<BusinessType>(
    (customer && getRawContactBusinessType(customer)) || "Grocery",
  );
  const [city, setCity] = useState(existingAddress?.city || SAUDI_CITIES[0]);
  const [district, setDistrict] = useState(existingAddress?.district ?? "");
  const [street, setStreet] = useState(existingAddress?.street ?? "");
  const [locationLink, setLocationLink] = useState(existingAddress?.locationLink ?? "");
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers()
      .then((customers) => {
        setDistrictOptions(
          buildDistrictOptions(customers, (c) => parseAddress(getRawContactAddress(c))),
        );
      })
      .catch(() => {});
  }, []);

  const isEditing = !!customer;

  const isDirty =
    !isEditing ||
    contactName.trim() !== (customer.contact_name ?? "") ||
    companyName.trim() !== (customer.company_name ?? "") ||
    customerType !== (isCustomerType(customer.customer_sub_type) ? customer.customer_sub_type : "business") ||
    // preferredLanguage starts equal to getContactPreferredLanguage(customer) (which
    // falls back to "am" when unset) — comparing against that same fallback-applied
    // value means a customer with no language on file isn't flagged dirty just for
    // showing the "am" default; only an actual pill click away from the start is.
    preferredLanguage !== getContactPreferredLanguage(customer) ||
    businessType !== ((customer && getRawContactBusinessType(customer)) || "Grocery") ||
    city !== (existingAddress?.city || SAUDI_CITIES[0]) ||
    district !== (existingAddress?.district ?? "") ||
    street !== (existingAddress?.street ?? "") ||
    locationLink !== (existingAddress?.locationLink ?? "");

  function handleSubmit() {
    if (isSaving) return;
    if (!contactName.trim()) {
      setError("Contact name is required");
      return;
    }
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }
    if (!isEditing && !phone.trim()) {
      setError("Phone is required");
      return;
    }
    if (!isEditing && !street.trim()) {
      setError("Street is required");
      return;
    }
    setError(null);

    if (isEditing && !isDirty) {
      onClose();
      return;
    }

    setIsSaving(true);
    const payload = {
      contact_name: contactName.trim(),
      company_name: companyName.trim(),
      customer_sub_type: customerType,
      preferred_language: preferredLanguage,
      business_type: businessType,
      address: {
        city: city.trim(),
        district: district.trim(),
        street: street.trim(),
        location_link: locationLink.trim(),
      },
      contact_persons: [{ first_name: contactName.trim(), phone: phone.trim() }],
    };
    (isEditing ? updateCustomer(customer.contact_id, payload) : createCustomer(payload))
      .then((saved) => {
        onSaved(saved);
        onClose();
      })
      .catch((e) => setError(e instanceof Error ? e.message : `Failed to ${isEditing ? "update" : "create"} customer`))
      .finally(() => setIsSaving(false));
  }

  return (
    <>
      <div className="sheet__header">
        <div className="sheet__header-row">
          <button type="button" className="sheet__cancel" onClick={onClose}>
            Cancel
          </button>
          <div className="sheet__title">{isEditing ? "Edit Customer" : "New Customer"}</div>
          <span className="sheet__spacer" />
        </div>
      </div>

      <div className="sheet__body">
        <div className="field">
          <label className="field-label" htmlFor="customer-contact-name">
            Contact name
          </label>
          <input
            id="customer-contact-name"
            type="text"
            className="input"
            placeholder="Name of the person who uses the phone number below"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="customer-company-name">
            Company name
          </label>
          <input
            id="customer-company-name"
            type="text"
            className="input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>

        {!isEditing && (
          <div className="field">
            <label className="field-label" htmlFor="customer-phone">
              Phone
            </label>
            <input
              id="customer-phone"
              type="tel"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <span className="field-hint">This becomes the customer's primary contact.</span>
          </div>
        )}

        <div className="field">
          <label className="field-label">Customer type</label>
          <div className="day-pill-row">
            {CUSTOMER_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pill${customerType === option.value ? " pill--active" : ""}`}
                onClick={() => setCustomerType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Preferred language</label>
          <div className="day-pill-row">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pill${preferredLanguage === option.value ? " pill--active" : ""}`}
                onClick={() => setPreferredLanguage(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Business type</label>
          <div className="day-pill-row">
            {BUSINESS_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pill${businessType === option.value ? " pill--active" : ""}`}
                onClick={() => setBusinessType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="customer-city">
            City
          </label>
          <div className="select-wrap">
            <select
              id="customer-city"
              className="select"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              {SAUDI_CITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="select-wrap__chevron" size={18} />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="customer-district">
            District
          </label>
          <input
            id="customer-district"
            type="text"
            className="input"
            list="customer-district-options"
            placeholder="Select or type a district"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          />
          <datalist id="customer-district-options">
            {districtOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="customer-street">
            Street
          </label>
          <input
            id="customer-street"
            type="text"
            className="input"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="field-label-row">
            <label className="field-label" htmlFor="customer-location-link">
              Location link
            </label>
            {locationLink.trim() && (
              <a href={locationLink.trim()} target="_blank" rel="noopener noreferrer" className="field-label-row__action">
                Open
              </a>
            )}
          </div>
          <input
            id="customer-location-link"
            type="url"
            className="input"
            placeholder="Paste a Google Maps link"
            value={locationLink}
            onChange={(e) => setLocationLink(e.target.value)}
          />
        </div>

        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="sheet__footer">
        <button type="button" className="btn btn--primary btn--full" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Customer"}
        </button>
      </div>
    </>
  );
}
