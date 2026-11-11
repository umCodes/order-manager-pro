import { useState } from "react";
import type { InvoiceDetailLineItem } from "../types";

type Props = {
  item: InvoiceDetailLineItem;
  currencySymbol: string;
  /** An invoice needs at least one line, so its last line can't be removed. */
  canRemove: boolean;
  onCancel: () => void;
  onConfirm: (values: { description: string; quantity: number; rate: number }) => void;
  onRemove: () => void;
};

/** Small in-page form for editing a single line item's description, quantity and rate, or removing it (unit is fixed, from the catalog item). */
export default function EditLineItemModal({ item, currencySymbol, canRemove, onCancel, onConfirm, onRemove }: Props) {
  const [description, setDescription] = useState(item.description ?? "");
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [rate, setRate] = useState(String(item.rate));
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleConfirm() {
    const parsedQuantity = Number(quantity);
    const parsedRate = Number(rate);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setValidationError("Quantity must be a positive number");
      return;
    }
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      setValidationError("Rate must be a non-negative number");
      return;
    }
    setValidationError(null);
    onConfirm({ description: description.trim(), quantity: parsedQuantity, rate: parsedRate });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Edit {item.name}</div>
        <div className="field">
          <label className="field-label" htmlFor="edit-line-item-quantity">
            Quantity ({item.unit})
          </label>
          <input
            id="edit-line-item-quantity"
            type="number"
            className="input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="edit-line-item-rate">
            Rate ({currencySymbol})
          </label>
          <input
            id="edit-line-item-rate"
            type="number"
            className="input"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="edit-line-item-description">
            Description
          </label>
          <textarea
            id="edit-line-item-description"
            className="textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {validationError && <div className="form-error">{validationError}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleConfirm}>
            Save
          </button>
        </div>
        <button
          type="button"
          className="btn btn--secondary btn--danger-text btn--full"
          style={{ marginTop: 10 }}
          disabled={!canRemove}
          title={canRemove ? undefined : "An invoice needs at least one item"}
          onClick={onRemove}
        >
          Remove item
        </button>
      </div>
    </div>
  );
}
