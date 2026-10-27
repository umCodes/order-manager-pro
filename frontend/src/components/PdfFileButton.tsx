import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FileText, Loader2, Share2 } from "lucide-react";
import { canShareFile, fetchPdfFile, openPdfUrl, sharePdfFile } from "../lib/downloadPdf";

type Props = {
  url: string;
  filename: string;
  /** What the file is, for the button's label ("invoice INV-12"). */
  label: string;
  /** A full button with this text instead of an icon button. */
  buttonText?: ReactNode;
  buttonClassName?: string;
  disabled?: boolean;
  /** Called once the file was opened or shared. */
  onDone?: () => void;
};

type FileState = { kind: "loading" } | { kind: "ready"; file: File } | { kind: "error"; message: string };

/**
 * A PDF's button: opens a small window with "Open file" (look at it in the
 * browser's viewer) and "Share file" (the phone's share sheet — WhatsApp,
 * Files, …). The file is fetched as soon as the window opens, so the share
 * sheet can open straight from the tap.
 */
export default function PdfFileButton({ url, filename, label, buttonText, buttonClassName, disabled, onDone }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<FileState>({ kind: "loading" });
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setIsOpen(true);
    setError(null);
    setFile({ kind: "loading" });
    fetchPdfFile(url, filename)
      .then((f) => setFile({ kind: "ready", file: f }))
      .catch((e) => setFile({ kind: "error", message: e instanceof Error ? e.message : "Failed to load the PDF" }));
  }

  function close() {
    if (isSharing) return;
    setIsOpen(false);
  }

  function openFile() {
    openPdfUrl(url);
    setIsOpen(false);
    onDone?.();
  }

  function shareFile() {
    if (file.kind !== "ready") return;
    setIsSharing(true);
    setError(null);
    sharePdfFile(file.file)
      .then((shared) => {
        if (!shared) return;
        setIsOpen(false);
        onDone?.();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't share the file"))
      .finally(() => setIsSharing(false));
  }

  const shareLabel = file.kind === "ready" && !canShareFile(file.file) ? "Save file" : "Share file";

  return (
    <>
      {buttonText ? (
        <button type="button" className={buttonClassName ?? "btn btn--secondary"} onClick={open} disabled={disabled}>
          {buttonText}
        </button>
      ) : (
        <button
          type="button"
          className="icon-btn"
          onClick={open}
          disabled={disabled}
          aria-label={`PDF of ${label}`}
          title="Open or share the PDF"
        >
          <FileText size={14} />
        </button>
      )}

      {isOpen &&
        createPortal(
        <div className="modal-overlay pdf-file-menu" onClick={(e) => e.stopPropagation()}>
          <div className="modal-overlay__backdrop" onClick={close} />
          <div className="modal">
            <div className="modal__title">{filename}</div>
            <div className="pdf-file-menu__actions">
              <button type="button" className="btn btn--secondary btn--full" onClick={openFile}>
                <ExternalLink size={15} /> Open file
              </button>
              <button
                type="button"
                className="btn btn--primary btn--full"
                onClick={shareFile}
                disabled={file.kind !== "ready" || isSharing}
              >
                {file.kind === "loading" || isSharing ? (
                  <Loader2 size={15} className="refresh-button__icon--spinning" />
                ) : (
                  <Share2 size={15} />
                )}
                {file.kind === "loading" ? "Preparing…" : shareLabel}
              </button>
            </div>
            {file.kind === "error" && <div className="form-error">{file.message}</div>}
            {error && <div className="form-error">{error}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--secondary" disabled={isSharing} onClick={close}>
                Close
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
