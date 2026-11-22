type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Error from the last confirm attempt, if any. */
  error?: string | null;
  /** Disables both buttons while a confirm is in flight. */
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Generic yes/no confirmation modal, styled to match the app's other modals — never use window.confirm. */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  error,
  isConfirming,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">{title}</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          {message}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" disabled={isConfirming} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn--primary" disabled={isConfirming} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
