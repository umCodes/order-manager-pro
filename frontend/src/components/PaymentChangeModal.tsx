import { useState } from "react";
import { currency } from "../lib/currency";
import { getContactList, getPrimaryContact } from "../lib/contacts";
import NotifyContactModal from "./NotifyContactModal";
import type { Contact, CustomerPayment } from "../types";

type Step = "form" | "confirmNotify" | "pickContact";

type Props = {
  /** "edit" corrects the amount; "delete" removes the payment. */
  mode: "edit" | "delete";
  payment: CustomerPayment;
  customer: Contact;
  isSaving: boolean;
  error?: string | null;
  onCancel: () => void;
  /** `amount` is the corrected amount when editing, undefined when deleting. */
  onSubmit: (amount: number | undefined, notify: boolean, notifyContactIds?: string[]) => void;
};

/**
 * Edit (correct the amount of) or delete one of a customer's payments, then
 * — like recording a payment — ask whether to notify the customer on
 * WhatsApp (the "payment correction" / "payment deletion" template) and,
 * with more than one contact, which ones.
 */
export default function PaymentChangeModal({ mode, payment, customer, isSaving, error, onCancel, onSubmit }: Props) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const label = payment.payment_number || "this payment";
  const parsedAmount = Math.round(Number(amount) * 100) / 100;

  function handleContinue() {
    if (isSaving) return;
    if (mode === "edit") {
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setValidationError("Enter an amount more than 0");
        return;
      }
      if (parsedAmount === payment.amount) {
        setValidationError("The amount is unchanged");
        return;
      }
    }
    setValidationError(null);
    setStep("confirmNotify");
  }

  function submit(notify: boolean, notifyContactIds?: string[]) {
    onSubmit(mode === "edit" ? parsedAmount : undefined, notify, notifyContactIds);
  }

  function handleYesNotify() {
    if (getContactList(customer).length > 1) {
      setStep("pickContact");
      return;
    }
    const primaryId = getPrimaryContact(customer)?.contact_person_id;
    submit(true, primaryId ? [primaryId] : undefined);
  }

  if (step === "pickContact") {
    return (
      <NotifyContactModal
        customer={customer}
        isSaving={isSaving}
        error={error}
        onCancel={onCancel}
        onConfirm={(contactPersonIds) => submit(true, contactPersonIds)}
      />
    );
  }

  if (step === "confirmNotify") {
    return (
      <div className="modal-overlay">
        <div className="modal-overlay__backdrop" onClick={isSaving ? undefined : onCancel} />
        <div className="modal">
          <div className="modal__title">Notify Customer?</div>
          <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
            {mode === "edit"
              ? `Send a WhatsApp message that ${label} was corrected from ${currency(payment.amount)} to ${currency(parsedAmount)}?`
              : `Send a WhatsApp message that ${label} was deleted?`}
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="invoice-details__actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={() => submit(false)}>
              {isSaving ? "Saving..." : "No, don't notify"}
            </button>
            <button type="button" className="btn btn--primary" disabled={isSaving} onClick={handleYesNotify}>
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
        <div className="modal__title">{mode === "edit" ? "Edit Payment" : "Delete Payment?"}</div>
        <div className="invoice-details__summary-row">
          {label} · {payment.date} · {currency(payment.amount)}
        </div>
        {mode === "edit" ? (
          <div className="field" style={{ marginTop: 14 }}>
            <label className="field-label" htmlFor="payment-change-amount">
              Correct amount
            </label>
            <input
              id="payment-change-amount"
              type="number"
              step="0.01"
              className="input"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        ) : (
          <div className="invoice-details__summary-row" style={{ marginTop: 14 }}>
            The invoices it paid will owe this amount again. This can't be undone.
          </div>
        )}
        {(validationError || error) && <div className="form-error">{validationError || error}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${mode === "delete" ? "btn--secondary btn--danger-text" : "btn--primary"}`}
            disabled={isSaving}
            onClick={handleContinue}
          >
            {mode === "edit" ? "Save" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
