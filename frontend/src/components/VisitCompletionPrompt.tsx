import { useState } from "react";
import { completeVisit, dismissVisitPrompt, useVisitPrompt, type VisitActivity } from "../lib/visits";

const ACTIVITY_TEXT: Record<VisitActivity, string> = {
  payment: "the payment just recorded",
  delivery: "the invoice just delivered",
  return: "the return just made",
};

/**
 * Asks "Mark today's visit as done?" after a payment, delivery or return for
 * a customer with a visit due (see offerVisitCompletion). Rendered once, at
 * the app root, so it shows over whichever page triggered it.
 */
export default function VisitCompletionPrompt() {
  const prompt = useVisitPrompt();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!prompt) return null;

  function close() {
    if (isSaving) return;
    setError(null);
    dismissVisitPrompt();
  }

  function confirm() {
    if (!prompt) return;
    setIsSaving(true);
    setError(null);
    completeVisit(prompt.customerId, { method: prompt.activity })
      .then(() => dismissVisitPrompt())
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to mark the visit as done"))
      .finally(() => setIsSaving(false));
  }

  return (
    <div className="modal-overlay visit-prompt">
      <div className="modal-overlay__backdrop" onClick={close} />
      <div className="modal">
        <div className="modal__title">Visit done?</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          {prompt.customerName} has a visit due. Mark it as done, confirmed by {ACTIVITY_TEXT[prompt.activity]}?
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="invoice-details__actions">
          <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={close}>
            Not now
          </button>
          <button type="button" className="btn btn--primary" disabled={isSaving} onClick={confirm}>
            {isSaving ? "Saving..." : "Mark visited"}
          </button>
        </div>
      </div>
    </div>
  );
}
