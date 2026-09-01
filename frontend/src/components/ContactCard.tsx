import { useState } from "react";
import { Phone, MessageCircle, Pencil, Trash2, Check, X, Star } from "lucide-react";
import type { ContactPerson } from "../types";
import { LEGACY_CONTACT_ID } from "../lib/contacts";

type Props = {
  contact: ContactPerson;
  isSaving: boolean;
  onSave: (next: { first_name: string; phone: string }) => Promise<void> | void;
  /** Not offered for the synthetic legacy contact — there's no real Zoho contact person to delete. */
  onDelete?: () => void;
  onMakePrimary: () => void;
};

/** Digits-only phone, for tel:/wa.me links. */
function dialablePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

/**
 * One customer contact as a card: read-only by default (name, phone, primary
 * badge, and Call/WhatsApp/Edit/Delete quick actions), switching its name
 * and phone into inputs when Edit is clicked. The Edit button itself becomes
 * Confirm while editing; Cancel discards changes and reverts to read-only
 * without saving anything.
 */
export default function ContactCard({ contact, isSaving, onSave, onDelete, onMakePrimary }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(contact.first_name);
  const [phone, setPhone] = useState(contact.phone || contact.mobile);
  const [error, setError] = useState<string | null>(null);

  const displayPhone = contact.phone || contact.mobile;

  function startEdit() {
    setName(contact.first_name);
    setPhone(contact.phone || contact.mobile);
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function confirmEdit() {
    if (isSaving) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setError("Contact name is required");
      return;
    }
    if (!trimmedPhone) {
      setError("Phone is required");
      return;
    }

    const isUnchanged = trimmedName === contact.first_name && trimmedPhone === displayPhone;
    if (isUnchanged) {
      setIsEditing(false);
      return;
    }

    Promise.resolve(onSave({ first_name: trimmedName, phone: trimmedPhone }))
      .then(() => setIsEditing(false))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to update contact"));
  }

  if (isEditing) {
    return (
      <div className="contact-card">
        <div className="contact-card__edit-fields">
          <input
            type="text"
            className="input"
            placeholder="Contact name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            autoFocus
          />
          <input
            type="tel"
            className="input"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isSaving}
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="contact-card__actions">
          <button type="button" className="icon-btn" onClick={cancelEdit} disabled={isSaving} aria-label="Cancel" title="Cancel">
            <X size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={confirmEdit}
            disabled={isSaving}
            aria-label="Confirm"
            title="Confirm"
          >
            <Check size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="contact-card">
      <div className="contact-card__info">
        <div className="contact-card__name-row">
          <span className="contact-card__name">{contact.first_name || "Contact"}</span>
          {contact.is_primary_contact && <span className="badge">primary</span>}
        </div>
        <div className="contact-card__phone">{displayPhone || "No phone"}</div>
      </div>
      <div className="contact-card__actions">
        {!contact.is_primary_contact && (
          <button
            type="button"
            className="icon-btn"
            onClick={onMakePrimary}
            aria-label="Make primary contact"
            title="Make primary contact"
          >
            <Star size={16} />
          </button>
        )}
        {displayPhone && (
          <a className="icon-btn" href={`tel:${dialablePhone(displayPhone)}`} aria-label="Call" title="Call">
            <Phone size={16} />
          </a>
        )}
        {displayPhone && (
          <a
            className="icon-btn"
            href={`https://wa.me/${dialablePhone(displayPhone).replace(/^\+/, "")}`}
            target="_blank"
            rel="noreferrer"
            aria-label="WhatsApp"
            title="WhatsApp"
          >
            <MessageCircle size={16} />
          </a>
        )}
        <button type="button" className="icon-btn" onClick={startEdit} aria-label="Edit contact" title="Edit contact">
          <Pencil size={16} />
        </button>
        {onDelete && contact.contact_person_id !== LEGACY_CONTACT_ID && (
          <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete contact" title="Delete contact">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
