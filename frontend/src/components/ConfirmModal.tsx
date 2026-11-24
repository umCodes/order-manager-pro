import { useConfirmArmedAction } from "../hooks/useConfirmArmedAction";

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
   * "Load then shoot": the first tap only loads the confirm button. For a
   * moment ("Wait...") taps are ignored, so a quick double-tap can't confirm;
   * then it turns red and shows `armedLabel`, and a tap confirms. Disarms
   * itself after a few seconds. Use for actions that are hard to undo, like
   * voiding an invoice. Same pattern as useConfirmArmedAction (payments).
   */
  requireDoubleTap?: boolean;
  armedLabel?: string;
  /** A quieter third choice, shown as a link under the buttons (e.g. "Ignore these…"). */
  secondaryAction?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
};

/** How long the loaded button waits for its second tap, once the pause is over. */
const ARM_WINDOW_MS = 4000;

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
  // Disarmed before onConfirm runs, so a failed attempt has to be loaded again.
  const { isArmed, isCoolingDown, trigger } = useConfirmArmedAction(onConfirm, ARM_WINDOW_MS);

  function handleConfirmClick() {
    if (requireDoubleTap) trigger();
    else onConfirm();
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
            disabled={isConfirming || (requireDoubleTap && isCoolingDown)}
            onClick={handleConfirmClick}
          >
            {requireDoubleTap && isCoolingDown && !isConfirming ? "Wait..." : showArmed ? armedLabel : confirmLabel}
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
