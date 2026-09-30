import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { invoicePdfUrl } from "../lib/api";
import { downloadPdfUrl } from "../lib/downloadPdf";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
};

/**
 * Icon button that downloads an invoice's PDF as a file. Works for any
 * invoice regardless of status (draft, sent, paid, ...), so it's used both on
 * the invoice details page and directly on invoice list cards.
 */
export default function DownloadInvoiceButton({ invoiceId, invoiceNumber }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);

  function handleClick() {
    if (isDownloading) return;
    setIsDownloading(true);
    downloadPdfUrl(invoicePdfUrl(invoiceId), `${invoiceNumber}.pdf`).finally(() => setIsDownloading(false));
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={handleClick}
      disabled={isDownloading}
      aria-label={`Download invoice ${invoiceNumber}`}
      title="Download invoice"
    >
      {isDownloading ? <Loader2 size={14} className="refresh-button__icon--spinning" /> : <Download size={14} />}
    </button>
  );
}
