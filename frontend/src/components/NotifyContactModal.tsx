import { useState } from "react";
import type { Contact } from "../types";
import { getContactList } from "../lib/contacts";

type Props = {
  customer: Contact;
  isSaving: boolean;
  error?: string | null;
  onCancel: () => void;
  /** Called with the chosen contact's id once a contact is selected/confirmed. */
  onConfirm: (contactPersonId: string) => void;
};

/**
 * Second step of the notify flow, shown only after the user has already
 * confirmed "yes, notify" in the caller's own modal. Lets them pick which
 * contact receives the message when the customer has more than one; with a
 * single contact this step is skipped entirely by the caller (no need to
 * render a picker for a choice that isn't really a choice), so this
 * component can assume `contacts.length > 1` whenever it's shown.
 */
export default function NotifyContactModal({ customer, isSaving, error, onCancel, onConfirm }: Props) {
  const contacts = getContactList(customer);
  const [selectedId, setSelectedId] = useState(() => {
    const primary = contacts.find((c) => c.is_primary_contact) ?? contacts[0];
    return primary?.contact_person_id ?? "";
  });

  const selected = contacts.find((c) => c.contact_person_id === selectedId);

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Send to which contact?</div>
        <div className="contact-picker-list">
          {contacts.map((c) => {
            const phone = c.phone || c.mobile;
            const isSelected = c.contact_person_id === selectedId;
            return (
              <div
                key={c.contact_person_id}
                className={`contact-picker-row${isSelected ? " contact-picker-row--selected" : ""}`}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setSelectedId(c.contact_person_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(c.contact_person_id);
                  }
                }}
              >
                <span className={`checkbox${isSelected ? " checkbox--checked" : ""}`} aria-hidden="true" />
                <div className="contact-picker-row__main">
                  <span className="contact-picker-row__name">
                    {c.first_name || "Contact"}
                    {c.is_primary_contact && <span className="badge">primary</span>}
                  </span>
                  <span className="contact-picker-row__phone">{phone || "No phone"}</span>
                </div>
              </div>
            );
          })}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={isSaving || !selected || !(selected.phone || selected.mobile)}
            onClick={() => {
              if (selected) onConfirm(selected.contact_person_id);
            }}
          >
            {isSaving ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
