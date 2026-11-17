import { useState } from "react";
import type { BreakdownLoading } from "../lib/shortages";

const amount = (value: number, unit: string) => `${value} ${unit}`.trim();

/**
 * What was loaded of one item of one draft, from the Items tab: Complete
 * (struck through on its Telegram message), Incomplete (what was received —
 * 0 by default, for missing: 🔴, or some: 🟡), or Clear (back as it was).
 * Kept in the app until "Send to Telegram".
 */
export default function ItemLoadingSheet({
  title,
  subtitle,
  loading,
  onSave,
  onCancel,
}: {
  title: string;
  subtitle: string;
  loading: BreakdownLoading;
  onSave: (received: number | null) => void;
  onCancel: () => void;
}) {
  const { item, loaded } = loading;
  const [isIncomplete, setIsIncomplete] = useState(!!loaded && loaded.received < item.ordered);
  const [value, setValue] = useState(loaded && loaded.received < item.ordered ? String(loaded.received) : "0");
  const [invalid, setInvalid] = useState<string | null>(null);

  function saveIncomplete() {
    const received = Number(value);
    if (value.trim() === "" || !Number.isFinite(received) || received < 0) {
      setInvalid("Enter how much you got (0 if none)");
      return;
    }
    if (received >= item.ordered) {
      setInvalid(`That's the whole ${amount(item.ordered, item.unit)}: use Complete`);
      return;
    }
    setInvalid(null);
    onSave(received);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal item-loading-sheet">
        <div className="modal__title">{title}</div>
        <div className="item-loading-sheet__subtitle">{subtitle}</div>
        <div className="item-loading-sheet__facts">
          Ordered {amount(item.ordered, item.unit)}
          {item.reported < item.ordered && <> · preparers said {amount(item.reported, item.unit)}</>}
        </div>

        {!isIncomplete ? (
          <div className="item-loading-sheet__choices">
            <button
              type="button"
              className={`item-loading-choice item-loading-choice--complete${loaded && loaded.received >= item.ordered ? " item-loading-choice--current" : ""}`}
             
              onClick={() => onSave(item.ordered)}
            >
              ✓ Complete
              <span>Got all {amount(item.ordered, item.unit)}</span>
            </button>
            <button
              type="button"
              className="item-loading-choice item-loading-choice--incomplete"
             
              onClick={() => setIsIncomplete(true)}
            >
              Incomplete
              <span>Missing or only part of it</span>
            </button>
            {loaded && (
              <button type="button" className="item-loading-choice item-loading-choice--clear" onClick={() => onSave(null)}>
                Clear
                <span>Not confirmed yet</span>
              </button>
            )}
          </div>
        ) : (
          <div className="field">
            <label className="field-label" htmlFor="item-loading-received">
              How much did you get? ({item.unit})
            </label>
            <input
              id="item-loading-received"
              type="number"
              inputMode="decimal"
              min={0}
              className="input"
              value={value}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => setValue(e.target.value)}
            />
            <div className="item-loading-sheet__hint">0 = missing. Of {amount(item.ordered, item.unit)}.</div>
          </div>
        )}

        {invalid && <div className="form-error">{invalid}</div>}
        <div className="invoice-details__actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--secondary"
           
            onClick={isIncomplete ? () => setIsIncomplete(false) : onCancel}
          >
            {isIncomplete ? "Back" : "Cancel"}
          </button>
          {isIncomplete && (
            <button type="button" className="btn btn--primary" onClick={saveIncomplete}>
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
