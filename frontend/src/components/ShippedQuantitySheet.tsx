import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatQuantity } from "../lib/prep";
import type { PrepLineItem, PrepOrder } from "../types";

type Props = {
  order: PrepOrder;
  line: PrepLineItem;
  onSave: (quantity: number | null) => void;
  onClose: () => void;
};

/**
 * Bottom sheet for recording how much of one line actually went out. Starts
 * at what was already recorded, or at the full amount needed, so the common
 * case is one tap on Save; the big − / + buttons and the number field handle
 * a shortfall.
 */
export default function ShippedQuantitySheet({ order, line, onSave, onClose }: Props) {
  const [text, setText] = useState(formatQuantity(line.shipped ?? line.quantity));
  const value = Number(text);
  const isValid = text.trim() !== "" && Number.isFinite(value) && value >= 0;

  function step(delta: number) {
    const base = isValid ? value : 0;
    setText(formatQuantity(Math.max(0, base + delta)));
  }

  return (
    <div className="prep-sheet-overlay" role="dialog" aria-modal="true" aria-label={`How much ${line.name} went out`}>
      <div className="prep-sheet-overlay__backdrop" onClick={onClose} />
      <div className="prep-sheet">
        <div className="prep-sheet__handle" aria-hidden="true" />
        <div className="prep-sheet__title">{line.name}</div>
        <div className="prep-sheet__subtitle">
          {order.customer_name} · {order.invoice_number}
        </div>

        <div className="prep-sheet__needed">
          Needed <strong>{formatQuantity(line.quantity)} {line.unit}</strong>
        </div>

        <div className="prep-sheet__question">How much went out?</div>
        <div className="prep-stepper">
          <button type="button" className="prep-stepper__btn" aria-label="One less" onClick={() => step(-1)}>
            <Minus size={28} strokeWidth={2.5} />
          </button>
          <div className="prep-stepper__value">
            <input
              className="prep-stepper__input"
              type="number"
              inputMode="decimal"
              min={0}
              value={text}
              style={{ width: `${Math.max(1, text.length) + 0.6}ch` }}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => e.target.select()}
              aria-label="Quantity shipped"
            />
            <span className="prep-stepper__unit">{line.unit}</span>
          </div>
          <button type="button" className="prep-stepper__btn" aria-label="One more" onClick={() => step(1)}>
            <Plus size={28} strokeWidth={2.5} />
          </button>
        </div>

        <div className="prep-sheet__quick">
          <button type="button" className="prep-quick-btn" onClick={() => setText(formatQuantity(line.quantity))}>
            All ({formatQuantity(line.quantity)})
          </button>
          <button type="button" className="prep-quick-btn prep-quick-btn--none" onClick={() => setText("0")}>
            None went out
          </button>
        </div>

        <button type="button" className="prep-big-btn prep-big-btn--save" disabled={!isValid} onClick={() => onSave(value)}>
          Save
        </button>
        {line.shipped !== null && (
          <button type="button" className="prep-sheet__clear" onClick={() => onSave(null)}>
            Undo: mark as not done yet
          </button>
        )}
      </div>
    </div>
  );
}
