import { useEffect, useState } from "react";
import { Check, CheckCheck, ChevronDown, ChevronRight, Clock, TriangleAlert } from "lucide-react";
import { fetchInvoiceWhatsAppSends, type InvoiceWhatsAppSend } from "../lib/api";

/** Re-read statuses this often while a message is still only "sent"… */
const POLL_MS = 4000;
/** …for this long after it was sent; past that it's left as is until the page is opened again. */
const POLL_WINDOW_MS = 3 * 60 * 1000;

const isPending = (send: InvoiceWhatsAppSend) =>
  send.status === "sent" && Date.now() - new Date(send.sentAt).getTime() < POLL_WINDOW_MS;

function StatusIcon({ status }: { status: InvoiceWhatsAppSend["status"] }) {
  if (status === "read") return <CheckCheck size={13} className="wa-sends__icon wa-sends__icon--read" />;
  if (status === "delivered") return <CheckCheck size={13} className="wa-sends__icon" />;
  if (status === "failed") return <TriangleAlert size={13} className="wa-sends__icon wa-sends__icon--failed" />;
  return <Check size={13} className="wa-sends__icon" />;
}

const STATUS_TEXT: Record<InvoiceWhatsAppSend["status"], string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

/**
 * The invoice's WhatsApp status, kept on the invoice: a quiet one-line
 * summary ("Delivered to 2 of 3") that opens to each number and how far its
 * message got — sent, delivered, read or failed. Refreshes on its own while
 * a message is still on its way. Shows nothing when the invoice was never
 * sent on WhatsApp. `reloadKey` refetches after a new send; `onRetry` resends
 * to one contact.
 */
export default function InvoiceWhatsAppStatus({
  invoiceId,
  reloadKey,
  onRetry,
  retryingContactId,
}: {
  invoiceId: string;
  reloadKey?: number;
  onRetry?: (contactPersonId: string) => void;
  retryingContactId?: string | null;
}) {
  const [sends, setSends] = useState<InvoiceWhatsAppSend[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () =>
      fetchInvoiceWhatsAppSends(invoiceId)
        .then((list) => {
          if (cancelled) return;
          setSends(list);
          if (list.some(isPending)) timer = window.setTimeout(load, POLL_MS);
        })
        .catch(() => {
          if (!cancelled) timer = window.setTimeout(load, POLL_MS * 2);
        });
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [invoiceId, reloadKey]);

  if (sends.length === 0) return null;

  const reached = sends.filter((s) => s.status === "delivered" || s.status === "read").length;
  const failed = sends.filter((s) => s.status === "failed").length;
  const waiting = sends.some(isPending);
  const summary =
    reached === sends.length
      ? sends.length === 1
        ? "Delivered"
        : `Delivered to all ${sends.length}`
      : `Delivered to ${reached} of ${sends.length}${failed ? ` · ${failed} failed` : ""}`;

  return (
    <div className="wa-sends">
      <button type="button" className="wa-sends__summary" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen}>
        {failed ? (
          <TriangleAlert size={13} className="wa-sends__icon wa-sends__icon--failed" />
        ) : waiting ? (
          <Clock size={13} className="wa-sends__icon" />
        ) : (
          <CheckCheck size={13} className={`wa-sends__icon${reached === sends.length ? " wa-sends__icon--read" : ""}`} />
        )}
        <span>Sent on WhatsApp · {summary}</span>
        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {isOpen && (
        <ul className="wa-sends__list">
          {sends.map((send) => (
            <li key={send.phone} className="wa-sends__row" title={send.error}>
              <StatusIcon status={send.status} />
              <span className="wa-sends__name">{send.name}</span>
              <span className="wa-sends__phone">{send.phone}</span>
              <span className={`wa-sends__status${send.status === "failed" ? " wa-sends__status--failed" : ""}`}>
                {STATUS_TEXT[send.status]}
              </span>
              {onRetry && (send.status === "failed" || (send.status === "sent" && !isPending(send))) && (
                <button
                  type="button"
                  className="link-btn wa-sends__retry"
                  disabled={!!retryingContactId}
                  onClick={() => onRetry(send.contactPersonId)}
                >
                  {retryingContactId === send.contactPersonId ? "Sending…" : "Retry"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
