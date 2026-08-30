import { ChevronDown } from "lucide-react";
import type { DraftInvoice } from "../types";

type Props = {
  drafts: DraftInvoice[];
  selectedDraftId: string | null;
  isLoading: boolean;
  onSelect: (draftId: string) => void;
};

/** Plain dropdown of a customer's draft invoices, by invoice number, for "Update Draft" mode. */
export default function DraftPicker({ drafts, selectedDraftId, isLoading, onSelect }: Props) {
  const isEmpty = !isLoading && drafts.length === 0;

  return (
    <div className="field">
      <label className="field-label" htmlFor="draft-select">
        Draft to update
      </label>
      <div className="select-wrap">
        <select
          id="draft-select"
          className="select"
          value={selectedDraftId ?? ""}
          disabled={isLoading || isEmpty}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>
            {isLoading ? "Loading drafts…" : isEmpty ? "No drafts for this customer" : "Select a draft"}
          </option>
          {drafts.map((draft) => (
            <option key={draft.invoice_id} value={draft.invoice_id}>
              {draft.invoice_number}
            </option>
          ))}
        </select>
        <ChevronDown className="select-wrap__chevron" size={18} />
      </div>
    </div>
  );
}
