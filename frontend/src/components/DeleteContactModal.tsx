type Props = {
  contactName: string;
  isDeleting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmation modal shown before a contact is actually deleted. */
export default function DeleteContactModal({ contactName, isDeleting, error, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Delete {contactName || "this contact"}?</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          This contact will be permanently removed from the customer.
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
