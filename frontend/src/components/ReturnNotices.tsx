import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { fetchInvoiceReturnList, returnNoticePdfUrl, type InvoiceReturnSummary } from "../lib/api";
import PdfFileButton from "./PdfFileButton";
import { currency } from "../lib/currency";

/**
 * The returns made from an invoice, each with its "Return Notice" PDF to
 * download (in the customer's language, like the invoice). Shows nothing
 * when there are none. `reloadKey` refetches, e.g. after a new return.
 * `onSend`, when given, adds a button to send a return's notice on WhatsApp.
 */
export default function ReturnNotices({
  invoiceId,
  reloadKey,
  onSend,
  isSending,
}: {
  invoiceId: string;
  reloadKey?: string;
  onSend?: (creditNoteId: string, creditNoteNumber: string) => void;
  isSending?: boolean;
}) {
  const [returns, setReturns] = useState<InvoiceReturnSummary["returns"]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchInvoiceReturnList(invoiceId)
      .then((list) => {
        if (!cancelled) setReturns(list);
      })
      .catch(() => {
        if (!cancelled) setReturns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, reloadKey]);

  if (returns.length === 0) return null;

  return (
    <div className="return-notices">
      <div className="return-notices__title">Returns</div>
      {returns.map((r) => (
        <div key={r.creditnote_id} className="return-notices__row">
          <span className="return-notices__main">
            <span className="return-notices__number">{r.creditnote_number}</span>
            <span className="return-notices__meta">
              {r.date} · {currency(r.total)}
            </span>
          </span>
          {onSend && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => onSend(r.creditnote_id, r.creditnote_number)}
              disabled={isSending}
              aria-label={`Send return notice ${r.creditnote_number} on WhatsApp`}
              title="Send return notice on WhatsApp"
            >
              <Send size={14} />
            </button>
          )}
          <PdfFileButton
            url={returnNoticePdfUrl(invoiceId, r.creditnote_id)}
            filename={`${r.creditnote_number}.pdf`}
            label={`return notice ${r.creditnote_number}`}
          />
        </div>
      ))}
    </div>
  );
}
