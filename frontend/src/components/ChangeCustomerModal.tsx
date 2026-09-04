import { useEffect, useState } from "react";
import { fetchCustomers } from "../lib/api";
import CustomerCombobox from "./CustomerCombobox";
import type { Contact } from "../types";

type Props = {
  currentCustomerName: string;
  isSaving: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (contact: Contact) => void;
};

/** Lets a draft invoice be reassigned to a different customer, picked from the same combobox used on the New Invoice page. */
export default function ChangeCustomerModal({ currentCustomerName, isSaving, error, onCancel, onConfirm }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    fetchCustomers().then(setContacts).catch(() => setContacts([]));
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Change Customer</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          Currently: {currentCustomerName}
        </div>
        <CustomerCombobox
          contacts={contacts}
          selectedContactId={selectedContact?.contact_id ?? ""}
          onSelect={setSelectedContact}
        />
        {error && <div className="form-error">{error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={isSaving || !selectedContact}
            onClick={() => selectedContact && onConfirm(selectedContact)}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
