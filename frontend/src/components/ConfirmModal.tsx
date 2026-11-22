import { useEffect, useState } from "react";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Error from the last confirm attempt, if any. */
  error?: string | null;
  /** Disables both buttons while a confirm is in flight. */
  isConfirming?: boolean;
  /**
   * "Load then shoot": the first tap only arms the confirm button (it turns red and
   * shows `armedLabel`); a second tap actually confirms. Disarms itself after a few seconds.
   * Use for actions that are hard to undo, like voiding an invoice.
   */
  requireDoubleTap?: boolean;
  armedLabel?: string;
  /** A quieter third choice, shown as a link under the buttons (e.g. "Ignore these…"). */
  secondaryAction?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
};

const ARM_TIMEOUT_MS = 4000;

/** Generic yes/no confirmation modal, styled to match the app's other modals — never use window.confirm. */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  error,
  isConfirming,
  requireDoubleTap,
  armedLabel = "Tap again to confirm",
  secondaryAction,
  onConfirm,
  onCancel,
}: Props) {
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    if (!isArmed) return;
    const t = setTimeout(() => setIsArmed(false), ARM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isArmed]);

  // A failed attempt should need re-arming before the next try.
  useEffect(() => {
    if (error) setIsArmed(false);
  }, [error]);

  function handleConfirmClick() {
    if (requireDoubleTap && !isArmed) {
      setIsArmed(true);
      return;
    }
    setIsArmed(false);
    onConfirm();
  }

  const showArmed = requireDoubleTap && isArmed && !isConfirming;

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
          <button
            type="button"
            className={`btn btn--primary${showArmed ? " btn--armed" : ""}`}
            disabled={isConfirming}
            onClick={handleConfirmClick}
          >
            {showArmed ? armedLabel : confirmLabel}
          </button>
        </div>
        {secondaryAction && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button type="button" className="link-btn" disabled={isConfirming} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
