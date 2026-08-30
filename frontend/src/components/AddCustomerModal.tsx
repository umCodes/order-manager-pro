import { useState } from "react";
import {
  createCustomer,
  updateCustomer,
  getContactPreferredLanguage,
  type CustomerType,
  type PreferredLanguage,
} from "../lib/api";
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!customer;

  const isDirty =
    !isEditing ||
    contactName.trim() !== (customer.contact_name ?? "") ||
    companyName.trim() !== (customer.company_name ?? "") ||
    phone.trim() !== (customer.contact_persons?.[0]?.phone || customer.phone || customer.mobile || "") ||
    customerType !== (isCustomerType(customer.customer_sub_type) ? customer.customer_sub_type : "business") ||
    // preferredLanguage starts equal to getContactPreferredLanguage(customer) (which
    // falls back to "am" when unset) — comparing against that same fallback-applied
    // value means a customer with no language on file isn't flagged dirty just for
    // showing the "am" default; only an actual pill click away from the start is.
    preferredLanguage !== getContactPreferredLanguage(customer);

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
    if (!phone.trim()) {
      setError("Phone is required");
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
        </div>

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
