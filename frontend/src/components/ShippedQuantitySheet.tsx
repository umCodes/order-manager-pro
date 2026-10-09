import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatQuantity, formatWeight, fromKilos, itemLabel, lineKilos } from "../lib/prep";
import type { PrepLineItem, PrepOrder } from "../types";

type Props = {
  order: PrepOrder;
  line: PrepLineItem;
  /** Quantity in the line's own unit (boxes stay boxes), or null to clear. */
  onSave: (quantity: number | null) => void;
  onClose: () => void;
};

/**
 * Bottom sheet for recording how much of one line actually went out. It
 * works in kilos — or grams for lines under a kilo — like the Telegram
 * message, and converts back to the line's own unit on save. Starts at what
 * was already recorded, or the full amount needed, so the common case is one
 * tap on Save.
 */
export default function ShippedQuantitySheet({ order, line, onSave, onClose }: Props) {
  const kilos = lineKilos(line);
  const inGrams = kilos.needed > 0 && kilos.needed < 1;
  const scale = inGrams ? 1000 : 1;
  const unitLabel = inGrams ? "ግራም" : "ኪሎ";
  const step = inGrams ? 100 : 1;

  const [text, setText] = useState(formatQuantity((kilos.shipped ?? kilos.needed) * scale));
  const value = Number(text);
  const isValid = text.trim() !== "" && Number.isFinite(value) && value >= 0;

  function stepBy(delta: number) {
    const base = isValid ? value : 0;
    setText(formatQuantity(Math.max(0, base + delta)));
  }

  return (
    <div className="prep-sheet-overlay" role="dialog" aria-modal="true" aria-label={itemLabel(line)}>
      <div className="prep-sheet-overlay__backdrop" onClick={onClose} />
      <div className="prep-sheet">
        <div className="prep-sheet__handle" aria-hidden="true" />
        <div className="prep-sheet__title">{itemLabel(line)}</div>
        <div className="prep-sheet__subtitle">
          {order.customer_name} · {order.invoice_number}
        </div>

        <div className="prep-sheet__needed">
          የሚፈለገው <strong>{formatWeight(kilos.needed)}</strong>
        </div>

        <div className="prep-sheet__question">ምን ያህል ወጣ?</div>
        <div className="prep-stepper">
          <button type="button" className="prep-stepper__btn" aria-label="ቀንስ" onClick={() => stepBy(-step)}>
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
              aria-label={unitLabel}
            />
            <span className="prep-stepper__unit">{unitLabel}</span>
          </div>
          <button type="button" className="prep-stepper__btn" aria-label="ጨምር" onClick={() => stepBy(step)}>
            <Plus size={28} strokeWidth={2.5} />
          </button>
        </div>

        <div className="prep-sheet__quick">
          <button type="button" className="prep-quick-btn" onClick={() => setText(formatQuantity(kilos.needed * scale))}>
            ሙሉ ({formatWeight(kilos.needed)})
          </button>
          <button type="button" className="prep-quick-btn prep-quick-btn--none" onClick={() => setText("0")}>
            ምንም አልወጣም
          </button>
        </div>

        <button
          type="button"
          className="prep-big-btn prep-big-btn--save"
          disabled={!isValid}
          onClick={() => onSave(fromKilos(value / scale, line.unit))}
        >
          Save
        </button>
        {line.shipped !== null && (
          <button type="button" className="prep-sheet__clear" onClick={() => onSave(null)}>
            Undo · ገና አልተሰራም
          </button>
        )}
      </div>
    </div>
  );
}
