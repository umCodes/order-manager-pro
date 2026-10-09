import { useState } from "react";
import { Check, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { expectedAmount, formatQuantity, formatWeight, fromKilos, hasConflict, itemLabel, toKilos } from "../lib/prep";
import type { PrepLineItem, PrepOrder, PrepStep } from "../types";

/** What each step is checked against, and the question it asks. */
const STEP_TEXT: Record<PrepStep, { expected: string; question: string }> = {
  prepared: { expected: "Need", question: "ምን ያህል ተዘጋጀ?" },
  sent: { expected: "Prepared", question: "ምን ያህል ወጣ?" },
  received: { expected: "Sent", question: "ምን ያህል ደረሰ?" },
};

type Props = {
  order: PrepOrder;
  line: PrepLineItem;
  step: PrepStep;
  /** Quantity in the line's own unit (boxes stay boxes), or null to clear. */
  onSave: (quantity: number | null) => void;
  onClose: () => void;
};

/** Parses what was typed: any amount of 0 or more, with "." or "," as the decimal point. */
function parseAmount(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Bottom sheet for recording one step of one line: how much was prepared,
 * sent, or received. Any amount is fine (1.5, 2.5, 0…) — the − / + buttons
 * move by half a kilo (100 grams for lines under a kilo) and the field takes
 * anything typed. Works in kilos like the Telegram message and saves back
 * in the line's own unit. Starts at what was already recorded, or at what
 * this step expects, so the common case is one tap on Save.
 */
export default function StepQuantitySheet({ order, line, step, onSave, onClose }: Props) {
  const expectedKilos = toKilos(expectedAmount(line, step) ?? line.quantity, line.unit);
  const recorded = line[step];
  const inGrams = expectedKilos > 0 && expectedKilos < 1;
  const scale = inGrams ? 1000 : 1;
  const unitLabel = inGrams ? "ግራም" : "ኪሎ";
  const stepSize = inGrams ? 100 : 0.5;
  const copy = STEP_TEXT[step];

  const [text, setText] = useState(
    formatQuantity((recorded === null ? expectedKilos : toKilos(recorded, line.unit)) * scale),
  );
  const value = parseAmount(text);

  function stepBy(delta: number) {
    setText(formatQuantity(Math.max(0, (value ?? 0) + delta)));
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

        <div className="prep-sheet__facts">
          <span className="prep-sheet__needed">
            {copy.expected} <strong>{formatWeight(expectedKilos)}</strong>
          </span>
          {step !== "received" && hasConflict(line) && (
            <span className="prep-sheet__needed prep-sheet__needed--conflict">
              <TriangleAlert size={15} strokeWidth={2.5} /> ደረሰ <strong>{formatWeight(toKilos(line.received ?? 0, line.unit))}</strong>
            </span>
          )}
        </div>

        <div className="prep-sheet__question">{copy.question}</div>
        <div className="prep-stepper">
          <button type="button" className="prep-stepper__btn" aria-label="ቀንስ" onClick={() => stepBy(-stepSize)}>
            <Minus size={28} strokeWidth={2.5} />
          </button>
          <div className="prep-stepper__value">
            <input
              className="prep-stepper__input"
              type="text"
              inputMode="decimal"
              value={text}
              style={{ width: `${Math.max(1, text.length) + 0.6}ch` }}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => e.target.select()}
              aria-label={unitLabel}
            />
            <span className="prep-stepper__unit">{unitLabel}</span>
          </div>
          <button type="button" className="prep-stepper__btn" aria-label="ጨምር" onClick={() => stepBy(stepSize)}>
            <Plus size={28} strokeWidth={2.5} />
          </button>
        </div>

        <div className="prep-sheet__quick">
          <button type="button" className="prep-quick-btn" onClick={() => setText(formatQuantity(expectedKilos * scale))}>
            <Check size={18} strokeWidth={3} /> ሙሉ {formatWeight(expectedKilos)}
          </button>
          <button type="button" className="prep-quick-btn prep-quick-btn--none" onClick={() => setText("0")}>
            <X size={18} strokeWidth={3} /> 0
          </button>
        </div>

        <button
          type="button"
          className="prep-big-btn prep-big-btn--save"
          disabled={value === null}
          onClick={() => value !== null && onSave(fromKilos(value / scale, line.unit))}
        >
          Save
        </button>
        {recorded !== null && (
          <button type="button" className="prep-sheet__clear" onClick={() => onSave(null)}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
