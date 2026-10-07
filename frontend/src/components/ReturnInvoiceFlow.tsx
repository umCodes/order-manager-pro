import { useEffect, useState } from "react";
import { createInvoiceReturn, fetchInvoiceReturns, type CreatedInvoiceReturn, type InvoiceReturnSummary } from "../lib/api";
import { currency } from "../lib/currency";
import AddItemModal from "./AddItemModal";
import type { Cart, CatalogItem } from "../types";

type Props = {
  invoiceId: string;
  /** The invoice's unpaid balance: a return's credit comes off it first, then off the customer's other unpaid invoices. */
  invoiceBalance: number;
  onClose: () => void;
  onCreated: (created: CreatedInvoiceReturn) => void;
};

type Step = "loading" | "pick" | "review";

/**
 * "Return Invoice": pick items from this invoice (in the usual item sheet,
 * limited to the invoice's own items and how many of each can still be
 * returned), review, and create it — a Zoho credit note on the backend,
 * which checks the quantities again.
 */
export default function ReturnInvoiceFlow({ invoiceId, invoiceBalance, onClose, onCreated }: Props) {
  const [summary, setSummary] = useState<InvoiceReturnSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [cart, setCart] = useState<Cart>({});
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInvoiceReturns(invoiceId)
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
        setStep("pick");
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load the invoice's items");
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const returnable = (summary?.items ?? []).filter((item) => item.returnable > 0);
  const catalog: CatalogItem[] = returnable.map((item) => ({
    item_id: item.item_id,
    name: item.name,
    description: item.description,
    unit: item.unit,
    rate: item.rate,
  }));
  const maxQuantity = Object.fromEntries(returnable.map((item) => [item.item_id, item.returnable]));
  const lines = returnable.filter((item) => cart[item.item_id]);
  const total = lines.reduce((sum, item) => sum + item.rate * cart[item.item_id]!.quantity, 0);

  function handleCreate() {
    setIsSaving(true);
    setSaveError(null);
    createInvoiceReturn(
      invoiceId,
      lines.map((item) => ({ item_id: item.item_id, quantity: cart[item.item_id]!.quantity })),
      reason,
    )
      .then(onCreated)
      .catch((e) => setSaveError(e instanceof Error ? e.message : "Failed to create the return"))
      .finally(() => setIsSaving(false));
  }

  if (loadError || (summary && returnable.length === 0)) {
    return (
      <div className="modal-overlay">
        <div className="modal-overlay__backdrop" onClick={onClose} />
        <div className="modal">
          <div className="modal__title">Return Invoice</div>
          <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
            {loadError ?? "Everything on this invoice has already been returned."}
          </div>
          <button type="button" className="btn btn--primary btn--full" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="modal-overlay">
        <div className="modal-overlay__backdrop" />
        <div className="modal">
          <div className="modal__title">Return Invoice</div>
          <div className="items-area__empty">Loading items...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AddItemModal
        open={step === "pick"}
        cart={cart}
        returnItems={{ items: catalog, maxQuantity }}
        showExcludeFromTelegram={false}
        onCancel={onClose}
        onClose={() => (Object.keys(cart).length > 0 ? setStep("review") : onClose())}
        onCommitItem={(itemId, form, item) =>
          setCart((current) => ({
            ...current,
            [itemId]: { description: item.description, rate: item.rate, quantity: Number(form.quantity), excludeFromTelegram: false },
          }))
        }
        onRemoveItem={(itemId) =>
          setCart((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          })
        }
      />

      {step === "review" && summary && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={isSaving ? undefined : onClose} />
          <div className="modal">
            <div className="modal__title">Return Invoice</div>
            <div className="invoice-details__summary-row">
              From {summary.invoice_number} · {summary.customer_name}
            </div>

            <div className="return-review__lines">
              {lines.map((item) => {
                const quantity = cart[item.item_id]!.quantity;
                return (
                  <div key={item.item_id} className="return-review__line">
                    <span className="return-review__name">
                      {item.name} × {quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                    <span>{currency(item.rate * quantity)}</span>
                  </div>
                );
              })}
              <div className="return-review__line return-review__line--total">
                <span>Credit</span>
                <span>{currency(total)}</span>
              </div>
            </div>

            <div className="return-review__note">
              {invoiceBalance > 0 && total <= invoiceBalance
                ? "This comes off the invoice's unpaid balance."
                : `${invoiceBalance > 0 ? `${currency(invoiceBalance)} comes off this invoice; the rest` : "This"} comes off ${summary.customer_name}'s other unpaid invoices, oldest first. Only anything beyond what they owe stays as credit.`}
              {summary.returns.length > 0 &&
                ` Already returned: ${summary.returns.map((r) => `${r.creditnote_number} (${currency(r.total)})`).join(", ")}.`}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="return-reason">
                Reason (optional)
              </label>
              <textarea
                id="return-reason"
                className="input"
                rows={2}
                placeholder="e.g. Customer returned 3 bags"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {saveError && <div className="form-error">{saveError}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--secondary" disabled={isSaving} onClick={() => setStep("pick")}>
                Edit items
              </button>
              <button type="button" className="btn btn--primary" disabled={isSaving || lines.length === 0} onClick={handleCreate}>
                {isSaving ? "Creating..." : "Create Return Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
