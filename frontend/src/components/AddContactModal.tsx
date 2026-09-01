import { useState } from "react";

type Props = {
  isSaving: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (payload: { first_name: string; phone: string; is_primary_contact: boolean }) => void;
};

/** Small in-page form for adding a new contact to a customer, with an option to make it the primary contact. */
export default function AddContactModal({ isSaving, error, onCancel, onConfirm }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleConfirm() {
    if (isSaving) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setValidationError("Contact name is required");
      return;
    }
    if (!trimmedPhone) {
      setValidationError("Phone is required");
      return;
    }
    setValidationError(null);
    onConfirm({ first_name: trimmedName, phone: trimmedPhone, is_primary_contact: makePrimary });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Add Contact</div>
        <div className="field">
          <label className="field-label" htmlFor="new-contact-name">
            Contact name
          </label>
          <input
            id="new-contact-name"
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="new-contact-phone">
            Phone
          </label>
          <input
            id="new-contact-phone"
            type="tel"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
          <span className="field-label" style={{ margin: 0 }}>
            Make this the primary contact
          </span>
        </label>
        {(validationError || error) && <div className="form-error">{validationError || error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? "Adding..." : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
