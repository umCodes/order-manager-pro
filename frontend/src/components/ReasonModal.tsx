import { useState } from "react";

type Props = {
  title: string;
  description?: string;
  isSaving?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

/** Captures a required free-text reason — used to record why an already-sent invoice was edited. */
export default function ReasonModal({ title, description, isSaving, error, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setValidationError("A reason is required");
      return;
    }
    setValidationError(null);
    onConfirm(trimmed);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">{title}</div>
        {description && (
          <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
            {description}
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="reason-modal-text">
            Reason
          </label>
          <textarea
            id="reason-modal-text"
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        {(validationError || error) && <div className="form-error">{validationError ?? error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={isSaving} onClick={handleConfirm}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
