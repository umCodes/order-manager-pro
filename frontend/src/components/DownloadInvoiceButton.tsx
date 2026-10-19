import { invoicePdfUrl } from "../lib/api";
import PdfFileButton from "./PdfFileButton";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
};

/**
 * An invoice's PDF button — open it or share it (see PdfFileButton). Works
 * for any invoice regardless of status (draft, sent, paid, ...), so it's used
 * both on the invoice details page and directly on invoice list cards.
 */
export default function DownloadInvoiceButton({ invoiceId, invoiceNumber }: Props) {
  return <PdfFileButton url={invoicePdfUrl(invoiceId)} filename={`${invoiceNumber}.pdf`} label={`invoice ${invoiceNumber}`} />;
}
