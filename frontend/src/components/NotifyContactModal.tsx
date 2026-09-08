import { useState } from "react";
import type { Contact } from "../types";
import { getContactList } from "../lib/contacts";

type Props = {
  customer: Contact;
  isSaving: boolean;
  error?: string | null;
  onCancel: () => void;
  /** Called with the chosen contact ids once confirmed — one, or several when "Notify multiple" is on. */
  onConfirm: (contactPersonIds: string[]) => void;
};

/**
 * Second step of the notify flow, shown only after the user has already
 * confirmed "yes, notify" in the caller's own modal. Defaults to picking a
 * single contact (radio-style), but a toggle at the top switches to
 * multi-select (checkbox-style) so the same message can go to several
 * contacts at once. With a single contact on file this step is skipped
 * entirely by the caller, so this component can assume `contacts.length > 1`
 * whenever it's shown.
 */
export default function NotifyContactModal({ customer, isSaving, error, onCancel, onConfirm }: Props) {
  const contacts = getContactList(customer);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const primary = contacts.find((c) => c.is_primary_contact) ?? contacts[0];
    return new Set(primary ? [primary.contact_person_id] : []);
  });

  function selectSingleMode() {
    setIsMultiSelect(false);
    // Collapse down to just one selection: whichever of the currently
    // selected contacts comes first in the list, or the first contact.
    setSelectedIds((prev) => {
      const first = contacts.find((c) => prev.has(c.contact_person_id)) ?? contacts[0];
      return new Set(first ? [first.contact_person_id] : []);
    });
  }

  function selectMultiMode() {
    setIsMultiSelect(true);
  }

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      if (!isMultiSelect) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedContacts = contacts.filter((c) => selectedIds.has(c.contact_person_id));
  const canSend = selectedContacts.length > 0 && selectedContacts.every((c) => c.phone || c.mobile);

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="mode-toggle" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`mode-toggle__option${!isMultiSelect ? " mode-toggle__option--active" : ""}`}
            onClick={selectSingleMode}
          >
            Single contact
          </button>
          <button
            type="button"
            className={`mode-toggle__option${isMultiSelect ? " mode-toggle__option--active" : ""}`}
            onClick={selectMultiMode}
          >
            Notify multiple
          </button>
        </div>
        <div className="modal__title">Send to which contact{isMultiSelect ? "s" : ""}?</div>
        <div className="contact-picker-list">
          {contacts.map((c) => {
            const phone = c.phone || c.mobile;
            const isSelected = selectedIds.has(c.contact_person_id);
            return (
              <div
                key={c.contact_person_id}
                className={`contact-picker-row${isSelected ? " contact-picker-row--selected" : ""}`}
                role={isMultiSelect ? "checkbox" : "radio"}
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => toggleContact(c.contact_person_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleContact(c.contact_person_id);
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
            disabled={isSaving || !canSend}
            onClick={() => onConfirm(selectedContacts.map((c) => c.contact_person_id))}
          >
            {isSaving ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
