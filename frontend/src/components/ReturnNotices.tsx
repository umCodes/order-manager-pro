import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { fetchInvoiceReturnList, returnNoticePdfUrl, type InvoiceReturnSummary } from "../lib/api";
import { downloadPdfUrl } from "../lib/downloadPdf";
import { currency } from "../lib/currency";

/**
 * The returns made from an invoice, each with its "Return Notice" PDF to
 * download (in the customer's language, like the invoice). Shows nothing
 * when there are none. `reloadKey` refetches, e.g. after a new return.
 */
export default function ReturnNotices({ invoiceId, reloadKey }: { invoiceId: string; reloadKey?: string }) {
  const [returns, setReturns] = useState<InvoiceReturnSummary["returns"]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  function download(creditNoteId: string, number: string) {
    if (downloadingId) return;
    setDownloadingId(creditNoteId);
    downloadPdfUrl(returnNoticePdfUrl(invoiceId, creditNoteId), `${number}.pdf`).finally(() => setDownloadingId(null));
  }

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
          <button
            type="button"
            className="icon-btn"
            onClick={() => download(r.creditnote_id, r.creditnote_number)}
            disabled={downloadingId === r.creditnote_id}
            aria-label={`Download return notice ${r.creditnote_number}`}
            title="Download return notice"
          >
            {downloadingId === r.creditnote_id ? <Loader2 size={14} className="refresh-button__icon--spinning" /> : <Download size={14} />}
          </button>
        </div>
      ))}
    </div>
  );
}
