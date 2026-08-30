type Props = {
  selectedCount: number;
  totalCount: number;
  isSaving: boolean;
  error?: string | null;
  /** Split off the unselected items into a new draft, then proceed. */
  onSplitAndContinue: () => void;
  /** Drop the unselected items (no new draft), then proceed. */
  onDropAndContinue: () => void;
  onCancel: () => void;
};

/**
 * Shown before marking an invoice as sent when only some of its line items
 * are selected. Lets the user choose whether the unselected items should be
 * split into a new draft, or simply dropped from the invoice.
 */
export default function SplitConfirmModal({
  selectedCount,
  totalCount,
  isSaving,
  error,
  onSplitAndContinue,
  onDropAndContinue,
  onCancel,
}: Props) {
  const unselectedCount = totalCount - selectedCount;

  return (
    <div className="modal-overlay">
      <div className="modal-overlay__backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal__title">Only {selectedCount} of {totalCount} items selected</div>
        <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
          Create a new draft for the {unselectedCount} unselected item{unselectedCount === 1 ? "" : "s"} before
          marking this invoice as sent?
        </div>
        {error && <div className="form-error">{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <button type="button" className="btn btn--primary btn--full" onClick={onSplitAndContinue} disabled={isSaving}>
            {isSaving ? "Working..." : "Yes, create new draft"}
          </button>
          <button type="button" className="btn btn--secondary btn--full" onClick={onDropAndContinue} disabled={isSaving}>
            {isSaving ? "Working..." : "No, drop them"}
          </button>
          <button type="button" className="btn btn--secondary btn--full" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
