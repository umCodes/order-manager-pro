import { useState } from "react";
import { currency } from "../lib/currency";
import { useConfirmArmedAction } from "../hooks/useConfirmArmedAction";

type Props = {
  /** Heading/subject shown above the balance, e.g. customer or invoice name. */
  title: string;
  outstandingBalance: number;
  isSaving: boolean;
  /** Error from the last submit attempt (e.g. API failure), shown below the input. */
  submitError?: string | null;
  onCancel: () => void;
  onSubmit: (amount: number) => void;
};

/**
 * Shared "record a payment" modal used on both the invoice and customer
 * detail pages. Pre-fills the full outstanding balance and requires the
 * save button to be clicked twice (see useConfirmArmedAction) before
 * submitting.
 */
export default function PaymentModal({ title, outstandingBalance, isSaving, submitError, onCancel, onSubmit }: Props) {
  const [amount, setAmount] = useState(String(outstandingBalance));
  const [validationError, setValidationError] = useState<string | null>(null);

  const { isArmed, trigger, disarm } = useConfirmArmedAction(() => {
    onSubmit(Number(amount));
  });

  function handleConfirmClick() {
    if (isSaving) return;
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      setValidationError("Enter a valid amount");
      return;
    }
    setValidationError(null);
    trigger();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Record Payment</div>
        <div className="invoice-details__summary-row">{title}</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          Outstanding balance: {currency(outstandingBalance)}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="payment-amount">
            Amount received
          </label>
          <input
            id="payment-amount"
            type="number"
            step="0.01"
            className="input"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              disarm();
            }}
          />
        </div>
        {(validationError || submitError) && (
          <div className="form-error">{validationError || submitError}</div>
        )}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${isArmed ? "btn--primary" : "btn--secondary"}`}
            disabled={isSaving}
            onClick={handleConfirmClick}
          >
            {isSaving ? "Saving..." : isArmed ? "Click again to confirm" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
