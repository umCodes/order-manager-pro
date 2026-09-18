import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import {
  createCustomer,
  updateCustomer,
  getContactPreferredLanguage,
  getRawContactAddress,
  getRawContactBusinessType,
  type BusinessType,
  type CustomerType,
  type PreferredLanguage,
} from "../lib/api";
import { SAUDI_CITIES, buildDistrictOptions, parseAddress } from "../lib/address";
import { getPrimaryContactPhone } from "../lib/contacts";
import type { Contact } from "../types";

type Props = {
  customer: Contact | null;
  customers: Contact[];
  onBack: () => void;
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

/** Full-page add/edit customer form — the only screen in this app besides the list it's opened from. */
export default function CustomerForm({ customer, customers, onBack, onSaved }: Props) {
  const isEditing = !!customer;

  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [phone, setPhone] = useState(customer ? getPrimaryContactPhone(customer) ?? "" : "");
  const [customerType, setCustomerType] = useState<CustomerType>(
    isCustomerType(customer?.customer_sub_type) ? customer.customer_sub_type : "business",
  );
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>(
    customer ? getContactPreferredLanguage(customer) : "am",
  );
  const [businessType, setBusinessType] = useState<BusinessType>(
    (customer && getRawContactBusinessType(customer)) || "Grocery",
  );
  const existingAddress = parseAddress(customer ? getRawContactAddress(customer) : undefined);
  const [city, setCity] = useState(existingAddress.city || SAUDI_CITIES[0]);
  const [district, setDistrict] = useState(existingAddress.district);
  const [street, setStreet] = useState(existingAddress.street);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const districtOptions = useMemo(
    () => buildDistrictOptions(customers, (c) => parseAddress(getRawContactAddress(c))),
    [customers],
  );

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
    setIsSaving(true);

    const payload = {
      contact_name: contactName.trim(),
      company_name: companyName.trim(),
      customer_sub_type: customerType,
      preferred_language: preferredLanguage,
      business_type: businessType,
      address: { city: city.trim(), district: district.trim(), street: street.trim() },
      contact_persons: [{ first_name: contactName.trim(), phone: phone.trim() }],
    };

    (isEditing ? updateCustomer(customer.contact_id, payload) : createCustomer(payload))
      .then(onSaved)
      .catch((e) => setError(e instanceof Error ? e.message : `Failed to ${isEditing ? "update" : "create"} customer`))
      .finally(() => setIsSaving(false));
  }

  return (
    <div>
      <div className="page-header">
        <button type="button" className="icon-btn page-header__back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title">{isEditing ? "Edit Customer" : "New Customer"}</h1>
      </div>

      <div className="form-section">
        <div className="form-section__title">Basic info</div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="contact-name">
              Contact name
            </label>
            <input
              id="contact-name"
              type="text"
              className="input"
              placeholder="Name of the person who uses the phone number below"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="company-name">
              Company name
            </label>
            <input
              id="company-name"
              type="text"
              className="input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          {!isEditing && (
            <div className="field">
              <label className="field-label" htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className="field-hint">This becomes the customer's primary contact.</span>
            </div>
          )}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section__title">Classification</div>

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
      </div>

      <div className="form-section">
        <div className="form-section__title">Address</div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="city">
              City
            </label>
            <div className="select-wrap">
              <select id="city" className="select" value={city} onChange={(e) => setCity(e.target.value)}>
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
            <label className="field-label" htmlFor="district">
              District
            </label>
            <input
              id="district"
              type="text"
              className="input"
              list="district-options"
              placeholder="Select or type a district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
            <datalist id="district-options">
              {districtOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="street">
              Street
            </label>
            <input id="street" type="text" className="input" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-page__footer">
        <button type="button" className="btn btn--primary btn--full" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Customer"}
        </button>
      </div>
    </div>
  );
}
