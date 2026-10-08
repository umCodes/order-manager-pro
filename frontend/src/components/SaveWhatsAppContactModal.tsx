import { useEffect, useState } from "react";
import { fetchCustomers, removeWhatsAppContact, saveWhatsAppContact, type WhatsAppChat } from "../lib/api";
import CustomerCombobox from "./CustomerCombobox";
import type { Contact } from "../types";

type Mode = "name" | "customer";

/**
 * Saves a number that isn't any customer's own phone to the WhatsApp tab's
 * contact list: give it a name, or link it to one of the customers. A saved
 * one can be changed or removed again.
 */
export default function SaveWhatsAppContactModal({
  chat,
  onClose,
  onSaved,
  onRemoved,
}: {
  chat: WhatsAppChat;
  onClose: () => void;
  /** With the number's updated chat-list entry. */
  onSaved: (chat: WhatsAppChat) => void;
  onRemoved: () => void;
}) {
  const [mode, setMode] = useState<Mode>(chat.saved === "customer" ? "customer" : "name");
  const [name, setName] = useState(chat.saved === "name" ? chat.name : "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customerId, setCustomerId] = useState(chat.saved === "customer" ? chat.customer_id ?? "" : "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers().then(setContacts).catch(() => setContacts([]));
  }, []);

  const canSave = mode === "name" ? name.trim().length > 0 : customerId.length > 0;

  function handleSave() {
    setIsSaving(true);
    setError(null);
    saveWhatsAppContact(chat.phone, mode === "name" ? { name: name.trim() } : { customer_id: customerId })
      .then(onSaved)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save contact"))
      .finally(() => setIsSaving(false));
  }

  function handleRemove() {
    setIsSaving(true);
    setError(null);
    removeWhatsAppContact(chat.phone)
      .then(onRemoved)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to remove contact"))
      .finally(() => setIsSaving(false));
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={isSaving ? undefined : onClose} />
      <div className="modal">
        <div className="modal__title">{chat.saved ? "Edit contact" : "Save contact"}</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          +{chat.phone}
        </div>
        <div className="mode-toggle" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`mode-toggle__option${mode === "name" ? " mode-toggle__option--active" : ""}`}
            onClick={() => setMode("name")}
          >
            Give a name
          </button>
          <button
            type="button"
            className={`mode-toggle__option${mode === "customer" ? " mode-toggle__option--active" : ""}`}
            onClick={() => setMode("customer")}
          >
            Link to customer
          </button>
        </div>
        {mode === "name" ? (
          <div className="field">
            <label className="field-label" htmlFor="wa-contact-name">
              Name
            </label>
            <input
              id="wa-contact-name"
              type="text"
              className="input"
              value={name}
              maxLength={100}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave && !isSaving) handleSave();
              }}
            />
          </div>
        ) : (
          <CustomerCombobox contacts={contacts} selectedContactId={customerId} onSelect={(c) => setCustomerId(c.contact_id)} />
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          {chat.saved && (
            <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={handleRemove}>
              Remove
            </button>
          )}
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={isSaving || !canSave} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
