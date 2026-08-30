import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { currency } from "../lib/currency";
import { useConfirmArmedAction } from "../hooks/useConfirmArmedAction";

type Props = {
  /** Heading/subject shown above the balance, e.g. customer or invoice name. */
  title: string;
  outstandingBalance: number;
  isSaving: boolean;
  /** Error from the last submit attempt (e.g. API failure), shown below the input. */
  submitError?: string | null;
  /** Whether to show the collapsible discount field (invoice-level payments only). */
  allowDiscount?: boolean;
  /**
   * Number of items that would be split into a new draft if the user opts
   * in, when only some of the invoice's items are selected. Omit/0 to hide
   * the split checkbox entirely (no selection, or the whole invoice).
   */
  itemsToSplitCount?: number;
  onCancel: () => void;
  onSubmit: (amount: number, discount?: number, createNewDraft?: boolean, notify?: boolean) => void;
};

/**
 * Shared "record a payment" modal used on both the invoice and customer
 * detail pages. Pre-fills the full outstanding balance and requires the
 * save button to be clicked twice (see useConfirmArmedAction) before
 * submitting. When allowDiscount is set, a collapsible discount field lets
 * the invoice's total be reduced (via an entity-level Zoho discount) before
 * the payment is applied. When itemsToSplitCount is set, a checkbox lets the
 * user opt into splitting the unselected items into a new draft first. Once
 * the amount step is confirmed, a second step asks whether to notify the
 * customer on WhatsApp before the payment is actually submitted.
 */
export default function PaymentModal({
  title,
  outstandingBalance,
  isSaving,
  submitError,
  allowDiscount,
  itemsToSplitCount,
  onCancel,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState(String(outstandingBalance));
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [discount, setDiscount] = useState("");
  const [createNewDraft, setCreateNewDraft] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmingNotify, setIsConfirmingNotify] = useState(false);

  const { isArmed, isCoolingDown, trigger, disarm } = useConfirmArmedAction(() => {
    setIsConfirmingNotify(true);
  });

  function handleConfirmClick() {
    if (isSaving) return;
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      setValidationError("Enter a valid amount");
      return;
    }
    if (discount && (Number(discount) < 0 || Number.isNaN(Number(discount)))) {
      setValidationError("Enter a valid discount");
      return;
    }
    setValidationError(null);
    trigger();
  }

  function submitPayment(notify: boolean) {
    const parsedDiscount = Number(discount);
    onSubmit(Number(amount), parsedDiscount > 0 ? parsedDiscount : undefined, !!itemsToSplitCount && createNewDraft, notify);
  }

  if (isConfirmingNotify) {
    return (
      <div className="modal-overlay">
        <div className="modal-overlay__backdrop" onClick={onCancel} />
        <div className="modal">
          <div className="modal__title">Notify Customer?</div>
          <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
            Send a WhatsApp notification about this payment?
          </div>
          {submitError && <div className="form-error">{submitError}</div>}
          <div className="invoice-details__actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={isSaving}
              onClick={() => submitPayment(false)}
            >
              {isSaving ? "Saving..." : "No, don't notify"}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={isSaving}
              onClick={() => submitPayment(true)}
            >
              {isSaving ? "Saving..." : "Yes, notify"}
            </button>
          </div>
        </div>
      </div>
    );
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
        {allowDiscount && (
          <div className="field" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="link-btn"
              style={{ display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
              onClick={() => setIsDiscountOpen((prev) => !prev)}
            >
              {isDiscountOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Add discount
            </button>
            {isDiscountOpen && (
              <input
                id="payment-discount"
                type="number"
                step="0.01"
                className="input"
                style={{ marginTop: 6 }}
                placeholder="Discount amount (optional)"
                value={discount}
                onChange={(e) => {
                  setDiscount(e.target.value);
                  disarm();
                }}
              />
            )}
          </div>
        )}
        {!!itemsToSplitCount && (
          <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={createNewDraft}
              onChange={(e) => {
                setCreateNewDraft(e.target.checked);
                disarm();
              }}
            />
            <span className="field-label" style={{ margin: 0 }}>
              Create a new draft for the {itemsToSplitCount} unselected item{itemsToSplitCount === 1 ? "" : "s"}
            </span>
          </label>
        )}
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
            disabled={isSaving || isCoolingDown}
            onClick={handleConfirmClick}
          >
            {isSaving
              ? "Saving..."
              : isCoolingDown
                ? "Wait..."
                : isArmed
                  ? "Click again to confirm"
                  : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
