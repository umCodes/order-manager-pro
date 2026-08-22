import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchCustomerById, fetchCustomerDraftInvoices, recordCustomerPayment } from "../lib/api";
import { currency } from "../lib/currency";
import ClickableCard from "../components/ClickableCard";
import PaymentModal from "../components/PaymentModal";
import type { Contact, DraftInvoice } from "../types";

type Props = {
  customerId: string;
  onBack: () => void;
  onSelectInvoice: (invoiceId: string) => void;
};

/**
 * Customer profile: balance, contact info, and their outstanding invoices.
 * Keyed by customerId internally so all local state resets cleanly on
 * navigation between customers instead of being reset manually inside an effect.
 */
export default function CustomerDetailsPage(props: Props) {
  return <CustomerDetailsView key={props.customerId} {...props} />;
}

function CustomerDetailsView({ customerId, onBack, onSelectInvoice }: Props) {
  const [customer, setCustomer] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<DraftInvoice[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCustomerById(customerId)
      .then((c) => {
        if (!cancelled) setCustomer(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customer");
      });
    fetchCustomerDraftInvoices(customerId)
      .then((list) => {
        if (!cancelled) setInvoices(list);
      })
      .catch(() => {
        if (!cancelled) setInvoices([]);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  function handleSubmitPayment(amount: number) {
    if (!customer) return;
    setIsRecordingPayment(true);
    recordCustomerPayment(customer.contact_id, amount)
      .then(() => {
        setIsPaymentModalOpen(false);
        return fetchCustomerById(customerId).then(setCustomer);
      })
      .catch((e) => setPaymentError(e instanceof Error ? e.message : "Failed to record payment"))
      .finally(() => setIsRecordingPayment(false));
  }

  const contactNumber = customer?.phone || customer?.mobile;

  return (
    <div className="invoice-details">
      <div className="invoice-details__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!customer && !error && <div className="items-area__empty">Loading...</div>}

      {customer && (
        <>
          <div className="invoice-details__customer">
            {customer.contact_name || customer.company_name}
          </div>

          <div className="invoice-details__summary">
            <div className="invoice-details__summary-left">
              {customer.company_name && customer.company_name !== customer.contact_name && (
                <div className="invoice-details__summary-row">{customer.company_name}</div>
              )}
              <div className="invoice-details__summary-row">{contactNumber || "No contact number"}</div>
            </div>
          </div>

          <div className="invoice-details__totals">
            <div className="invoice-details__totals-row invoice-details__totals-row--balance">
              <span>Outstanding balance</span>
              <span>{currency(customer.outstanding_receivable_amount)}</span>
            </div>
          </div>

          <div className="invoice-details__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPaymentError(null);
                setIsPaymentModalOpen(true);
              }}
              disabled={customer.outstanding_receivable_amount <= 0}
            >
              Record Payment
            </button>
          </div>

          <div className="line-items">
            <div className="line-items__header">Outstanding Invoices</div>
            {invoices.length === 0 ? (
              <div className="items-area__empty">No outstanding invoices</div>
            ) : (
              <div className="draft-list">
                {invoices.map((invoice) => (
                  <ClickableCard key={invoice.invoice_id} onClick={() => onSelectInvoice(invoice.invoice_id)}>
                    <div className="draft-card__top">
                      <span className="draft-card__invoice-number">{invoice.invoice_number}</span>
                      <span className="draft-card__status">{invoice.status}</span>
                    </div>
                    <div className="draft-card__bottom">
                      <span className="draft-card__scheduled">{invoice.date}</span>
                      <span className="draft-card__total">{currency(invoice.total)}</span>
                    </div>
                  </ClickableCard>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isPaymentModalOpen && customer && (
        <PaymentModal
          title={customer.contact_name || customer.company_name}
          outstandingBalance={customer.outstanding_receivable_amount}
          isSaving={isRecordingPayment}
          submitError={paymentError}
          onCancel={() => setIsPaymentModalOpen(false)}
          onSubmit={handleSubmitPayment}
        />
      )}
    </div>
  );
}
