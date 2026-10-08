import { useEffect, useState } from "react";
import { fetchCustomers, lookupWhatsAppContact, removeWhatsAppContact, saveWhatsAppContact, type WhatsAppChat } from "../lib/api";
import CustomerCombobox from "./CustomerCombobox";
import type { Contact } from "../types";

type Mode = "name" | "customer";

/** Whether the number is already one of the picked customer's contacts (looked up in Zoho). */
type Lookup =
  | { status: "loading" }
  | { status: "done"; customerName: string; contactName: string | null }
  | { status: "error"; message: string };

/** A finished lookup, and which customer it was for. */
type LookupResult = Exclude<Lookup, { status: "loading" }> & { customerId: string };

/**
 * Saves a number that isn't any customer's own phone to the WhatsApp tab's
 * contact list: give it a name, or link it to one of the customers. Linking
 * first checks whether the number is already one of that customer's
 * contacts and, if so, uses that contact's name; otherwise the person can be
 * named here. Either way the person's name comes first and the customer's
 * second. A saved one can be changed or removed again.
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
  const [personName, setPersonName] = useState(chat.saved === "customer" && chat.customer_name ? chat.name : "");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers().then(setContacts).catch(() => setContacts([]));
  }, []);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    lookupWhatsAppContact(chat.phone, customerId)
      .then((result) => {
        if (!cancelled)
          setLookupResult({ customerId, status: "done", customerName: result.customer_name, contactName: result.contact?.name ?? null });
      })
      .catch((e) => {
        if (!cancelled)
          setLookupResult({ customerId, status: "error", message: e instanceof Error ? e.message : "Couldn't check the customer's contacts" });
      });
    return () => {
      cancelled = true;
    };
  }, [chat.phone, customerId]);

  // Still loading until there's a result for the customer picked now.
  const lookup: Lookup | null = !customerId ? null : lookupResult?.customerId === customerId ? lookupResult : { status: "loading" };
  const existingName = lookup?.status === "done" ? lookup.contactName : null;
  const customerName =
    lookup?.status === "done" ? lookup.customerName : contacts.find((c) => c.contact_id === customerId)?.contact_name ?? "";
  // The customer's own contact name wins over anything typed here.
  const linkedPersonName = existingName ?? personName.trim();

  const canSave =
    mode === "name" ? name.trim().length > 0 : customerId.length > 0 && lookup?.status !== "loading";

  function handleSave() {
    setIsSaving(true);
    setError(null);
    saveWhatsAppContact(
      chat.phone,
      mode === "name" ? { name: name.trim() } : { customer_id: customerId, ...(linkedPersonName && { name: linkedPersonName }) },
    )
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
          <>
            <CustomerCombobox contacts={contacts} selectedContactId={customerId} onSelect={(c) => setCustomerId(c.contact_id)} />
            {customerId && lookup?.status === "loading" && <div className="wa-contact-lookup">Checking {customerName || "the customer"}'s contacts…</div>}
            {customerId && lookup?.status === "error" && <div className="wa-contact-lookup">{lookup.message}</div>}
            {customerId && lookup?.status === "done" && existingName && (
              <div className="wa-contact-lookup wa-contact-lookup--found">
                This number is already saved under {lookup.customerName} as <strong>{existingName}</strong>.
              </div>
            )}
            {customerId && lookup?.status === "done" && !existingName && (
              <div className="field" style={{ marginTop: 12 }}>
                <label className="field-label" htmlFor="wa-contact-person">
                  Contact name (optional)
                </label>
                <input
                  id="wa-contact-person"
                  type="text"
                  className="input"
                  value={personName}
                  maxLength={100}
                  placeholder="Who is this at the customer?"
                  onChange={(e) => setPersonName(e.target.value)}
                />
                <div className="wa-contact-lookup">Not in {lookup.customerName}'s contacts yet.</div>
              </div>
            )}
            {customerId && lookup?.status === "done" && (
              <div className="wa-contact-preview">
                <span className="wa-contact-preview__label">Shows as</span>
                <span className="wa-list__name">{linkedPersonName || customerName}</span>
                {linkedPersonName && <span className="wa-list__customer">{customerName}</span>}
              </div>
            )}
          </>
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
