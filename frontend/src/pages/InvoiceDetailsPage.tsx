import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { fetchInvoiceById, markInvoiceAsSent, recordInvoicePayment, updateInvoiceDate } from "../lib/api";
import { currency } from "../lib/currency";
import { buildScheduleOptions } from "../lib/scheduledDate";
import { formatInvoiceForCopy } from "../lib/itemSummary";
import ResendButton from "../components/ResendButton";
import PaymentModal from "../components/PaymentModal";
import DayPickerModal from "../components/DayPickerModal";
import CopyButton from "../components/CopyButton";
import type { InvoiceDetail } from "../types";

type Props = {
  invoiceId: string;
  onBack: () => void;
};

/**
 * Invoice profile: line items, totals, and actions (pay, mark sent, resend, reschedule).
 * Keyed by invoiceId internally so all local state resets cleanly on navigation
 * between invoices instead of being reset manually inside an effect.
 */
export default function InvoiceDetailsPage({ invoiceId, onBack }: Props) {
  return <InvoiceDetailsView key={invoiceId} invoiceId={invoiceId} onBack={onBack} />;
}

function InvoiceDetailsView({ invoiceId, onBack }: Props) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [scheduleOptions] = useState(() => buildScheduleOptions());

  useEffect(() => {
    let cancelled = false;

    fetchInvoiceById(invoiceId)
      .then((inv) => {
        if (!cancelled) setInvoice(inv);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load invoice");
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  function toggleItemSelected(lineItemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineItemId)) next.delete(lineItemId);
      else next.add(lineItemId);
      return next;
    });
  }

  function handleSubmitPayment(amount: number) {
    if (!invoice) return;
    setIsRecordingPayment(true);
    recordInvoicePayment(invoice.invoice_id, amount)
      .then(() => {
        setIsPaymentModalOpen(false);
        return fetchInvoiceById(invoiceId).then(setInvoice);
      })
      .catch((e) => setPaymentError(e instanceof Error ? e.message : "Failed to record payment"))
      .finally(() => setIsRecordingPayment(false));
  }

  function handleMarkAsSent() {
    if (!invoice) return;
    setIsMarkingSent(true);
    setActionError(null);
    markInvoiceAsSent(invoice.invoice_id)
      .then(() => fetchInvoiceById(invoiceId).then(setInvoice))
      .catch((e) => setActionError(e instanceof Error ? e.message : "Failed to mark invoice as sent"))
      .finally(() => setIsMarkingSent(false));
  }

  function handleSelectDate(date: string) {
    if (!invoice) return;
    setIsUpdatingDate(true);
    setDateError(null);
    updateInvoiceDate(invoice.invoice_id, date)
      .then(() => {
        setIsDateModalOpen(false);
        return fetchInvoiceById(invoiceId).then(setInvoice);
      })
      .catch((e) => setDateError(e instanceof Error ? e.message : "Failed to update date"))
      .finally(() => setIsUpdatingDate(false));
  }

  function handleResent() {
    fetchInvoiceById(invoiceId).then(setInvoice).catch(() => {});
  }

  return (
    <div className="invoice-details">
      <div className="invoice-details__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        {invoice && (
          <div className="page-header__actions">
            <CopyButton getText={() => formatInvoiceForCopy(invoice.invoice_number, invoice.line_items)} />
            <ResendButton
              invoiceId={invoice.invoice_id}
              currentDate={invoice.date}
              onResent={handleResent}
            />
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {!invoice && !error && <div className="items-area__empty">Loading...</div>}

      {invoice && (
        <>
          <div className="invoice-details__customer">{invoice.customer_name}</div>

          <div className="invoice-details__summary">
            <div className="invoice-details__summary-left">
              <div className="invoice-details__summary-row">{invoice.invoice_number}</div>
              <div className="invoice-details__summary-row invoice-details__summary-row--date">
                {invoice.date}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setDateError(null);
                    setIsDateModalOpen(true);
                  }}
                >
                  Change date
                </button>
              </div>
              <div className="invoice-details__summary-row">{currency(invoice.total)}</div>
            </div>
            <span className="draft-card__status">{invoice.status}</span>
          </div>

          <div className="line-items">
            <div className="line-items__header">Items</div>
            {invoice.line_items.map((item) => {
              const isSelected = selectedItemIds.has(item.line_item_id);
              return (
                <div
                  key={item.line_item_id}
                  className={`invoice-item-row${isSelected ? " invoice-item-row--selected" : ""}`}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => toggleItemSelected(item.line_item_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleItemSelected(item.line_item_id);
                    }
                  }}
                >
                  <span className={`checkbox${isSelected ? " checkbox--checked" : ""}`} aria-hidden="true">
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </span>
                  <div className="invoice-item-row__main">
                    <div className="line-item__name">{item.name}</div>
                    {item.description && (
                      <div className="line-item__meta">{item.description}</div>
                    )}
                    <div className="line-item__meta">
                      {item.quantity} {item.unit} × {currency(item.rate)}
                    </div>
                  </div>
                  <span className="line-item__total">{currency(item.item_total)}</span>
                </div>
              );
            })}
          </div>

          <div className="invoice-details__totals">
            <div className="invoice-details__totals-row">
              <span>Subtotal</span>
              <span>{currency(invoice.sub_total)}</span>
            </div>
            <div className="invoice-details__totals-row">
              <span>Total</span>
              <span>{currency(invoice.total)}</span>
            </div>
            <div className="invoice-details__totals-row invoice-details__totals-row--balance">
              <span>Balance due</span>
              <span>{currency(invoice.balance)}</span>
            </div>
          </div>

          {actionError && <div className="form-error">{actionError}</div>}

          <div className="invoice-details__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPaymentError(null);
                setIsPaymentModalOpen(true);
              }}
              disabled={invoice.balance <= 0}
            >
              Record Payment
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleMarkAsSent}
              disabled={invoice.status !== "draft"}
            >
              {isMarkingSent ? "Marking..." : "Mark as Sent"}
            </button>
          </div>
        </>
      )}

      {isPaymentModalOpen && invoice && (
        <PaymentModal
          title={invoice.invoice_number}
          outstandingBalance={invoice.balance}
          isSaving={isRecordingPayment}
          submitError={paymentError}
          onCancel={() => setIsPaymentModalOpen(false)}
          onSubmit={handleSubmitPayment}
        />
      )}

      {isDateModalOpen && invoice && (
        <DayPickerModal
          title="Change Date"
          options={scheduleOptions}
          selectedDate={invoice.date}
          isSaving={isUpdatingDate}
          error={dateError}
          onSelect={handleSelectDate}
          onClose={() => setIsDateModalOpen(false)}
        />
      )}
    </div>
  );
}
