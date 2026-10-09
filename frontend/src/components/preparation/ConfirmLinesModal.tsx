import { formatAmount, itemLabel } from "../../lib/preparation";
import type { PrepLineItem, PrepOrder } from "../../types";

type Props = {
  order: PrepOrder;
  title: string;
  /** Each line with the amount it will show once confirmed (or what it showed before an undo). */
  lines: { line: PrepLineItem; amount: number }[];
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Asks before changing a whole order at once ("all prepared" or undoing
 * it), listing every line it will change so nothing is confirmed blind.
 */
export default function ConfirmLinesModal({ order, title, lines, confirmLabel, isDanger, onConfirm, onCancel }: Props) {
  return (
    <div className="prp-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="prp-overlay__backdrop" onClick={onCancel} />
      <div className="prp-sheet">
        <div className="prp-sheet__handle" aria-hidden="true" />
        <div className="prp-sheet__title">{title}</div>
        <div className="prp-sheet__subtitle">
          {order.invoice_number} · {order.customer_name}
        </div>
        <div className="prp-confirm-list">
          {lines.map(({ line, amount }) => (
            <div key={line.line_item_id} className="prp-confirm-list__row">
              <span className="prp-confirm-list__amount">{formatAmount(amount, line.unit)}</span>
              <span>{itemLabel(line)}</span>
            </div>
          ))}
        </div>
        <div className="prp-sheet__actions">
          <button type="button" className="prp-btn prp-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`prp-btn ${isDanger ? "prp-btn--danger" : "prp-btn--primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
