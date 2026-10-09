import { useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { GRAM_STEP, formatAmount, fromKilos, isWeighed, itemLabel, splitKilos, toKilos } from "../../lib/preparation";
import type { PrepLineItem, PrepOrder } from "../../types";

type Props = {
  order: PrepOrder;
  line: PrepLineItem;
  /** Prepared amount in the line's own unit (boxes stay boxes), or null to clear. */
  onSave: (quantity: number | null) => void;
  onClose: () => void;
};

/** A count typed by hand: any amount of 0 or more, "." or "," as the decimal point. */
function parseCount(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** One − value + row. */
function Stepper({
  value,
  unit,
  onMinus,
  onPlus,
  onType,
}: {
  value: string;
  unit: string;
  onMinus: () => void;
  onPlus: () => void;
  onType?: (text: string) => void;
}) {
  return (
    <div className="prp-stepper">
      <button type="button" className="prp-stepper__btn" aria-label={`${unit} −`} onClick={onMinus}>
        <Minus size={24} strokeWidth={2.5} />
      </button>
      <div className="prp-stepper__value">
        {onType ? (
          <input
            className="prp-stepper__input"
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onType(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label={unit}
          />
        ) : (
          <span className="prp-stepper__input">{value}</span>
        )}
        <span className="prp-stepper__unit">{unit}</span>
      </div>
      <button type="button" className="prp-stepper__btn" aria-label={`${unit} +`} onClick={onPlus}>
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * Records how much of one line was prepared, against what was ordered.
 * Weighed items get two steppers — whole kilos, and grams in steps of 50
 * that roll over into the next kilo at 1000 — so nobody has to work in
 * decimals. Counted items get one stepper that also takes any typed amount.
 * Starts at what was recorded before, or at the full order.
 */
export default function AmountSheet({ order, line, onSave, onClose }: Props) {
  const weighed = isWeighed(line.unit);
  const start = line.prepared ?? line.quantity;
  const startSplit = splitKilos(toKilos(start, line.unit));

  const [kilos, setKilos] = useState(startSplit.kilos);
  const [grams, setGrams] = useState(startSplit.grams);
  const [countText, setCountText] = useState(String(start));

  function setWeight(totalKilos: number) {
    const split = splitKilos(totalKilos);
    setKilos(split.kilos);
    setGrams(split.grams);
  }

  function addGrams(direction: 1 | -1) {
    // Snap to the 50-gram grid first, then step; 1000 grams rolls into a kilo, below 0 borrows one.
    const snapped = direction === 1 ? Math.floor(grams / GRAM_STEP) * GRAM_STEP : Math.ceil(grams / GRAM_STEP) * GRAM_STEP;
    const total = kilos * 1000 + snapped + direction * GRAM_STEP;
    if (total < 0) return;
    setKilos(Math.floor(total / 1000));
    setGrams(total % 1000);
  }

  const count = parseCount(countText);
  const value = weighed ? fromKilos(kilos + grams / 1000, line.unit) : count;

  return (
    <div className="prp-overlay" role="dialog" aria-modal="true" aria-label={itemLabel(line)}>
      <div className="prp-overlay__backdrop" onClick={onClose} />
      <div className="prp-sheet">
        <div className="prp-sheet__handle" aria-hidden="true" />
        <div className="prp-sheet__title">{itemLabel(line)}</div>
        <div className="prp-sheet__subtitle">
          {order.invoice_number} · {order.customer_name}
        </div>
        <div className="prp-sheet__ordered">
          Ordered <strong>{formatAmount(line.quantity, line.unit)}</strong>
        </div>

        {weighed ? (
          <div className="prp-sheet__steppers">
            <Stepper
              value={String(kilos)}
              unit="ኪሎ"
              onMinus={() => setKilos((k) => Math.max(0, k - 1))}
              onPlus={() => setKilos((k) => k + 1)}
              onType={(text) => {
                const typed = Number(text.replace(/\D/g, ""));
                setKilos(Number.isFinite(typed) ? typed : 0);
              }}
            />
            <Stepper value={String(grams)} unit="ግራም" onMinus={() => addGrams(-1)} onPlus={() => addGrams(1)} />
          </div>
        ) : (
          <div className="prp-sheet__steppers">
            <Stepper
              value={countText}
              unit={formatAmount(0, line.unit).replace(/^0\s*/, "")}
              onMinus={() => setCountText(String(Math.max(0, (count ?? 0) - 1)))}
              onPlus={() => setCountText(String((count ?? 0) + 1))}
              onType={setCountText}
            />
          </div>
        )}

        <div className="prp-sheet__quick">
          <button
            type="button"
            className="prp-btn prp-btn--secondary"
            onClick={() => (weighed ? setWeight(toKilos(line.quantity, line.unit)) : setCountText(String(line.quantity)))}
          >
            <Check size={18} strokeWidth={3} /> ሙሉ
          </button>
          <button
            type="button"
            className="prp-btn prp-btn--secondary prp-btn--none"
            onClick={() => (weighed ? setWeight(0) : setCountText("0"))}
          >
            <X size={18} strokeWidth={3} /> የለም
          </button>
        </div>

        <button
          type="button"
          className="prp-btn prp-btn--primary prp-btn--big"
          disabled={value === null}
          onClick={() => value !== null && onSave(value)}
        >
          Save
        </button>
        {line.prepared !== null && (
          <button type="button" className="prp-sheet__undo" onClick={() => onSave(null)}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
