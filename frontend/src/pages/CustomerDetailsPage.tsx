import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Coffee, ExternalLink, MapPin, Pencil, Send, ShoppingBasket, TriangleAlert, UserCheck, UserPlus, UserX, UtensilsCrossed, type LucideIcon } from "lucide-react";
import {
  fetchCustomerById,
  fetchCustomerDraftInvoices,
  fetchCustomerPayments,
  sendCustomerPaymentNotification,
  recordCustomerPayment,
  addCustomerContact,
  updateCustomerContact,
  deleteCustomerContact,
  markCustomerContactPrimary,
  setCustomerActive,
  getRawContactAddress,
  getRawContactBusinessType,
  getRawContactPreferredLanguage,
  type BusinessType,
} from "../lib/api";
import { parseAddress } from "../lib/address";
import { currency } from "../lib/currency";
import { formatStatus } from "../lib/status";
import { getContactList, getPrimaryContact, LEGACY_CONTACT_ID } from "../lib/contacts";
import ClickableCard from "../components/ClickableCard";
import DownloadInvoiceButton from "../components/DownloadInvoiceButton";
import PaymentModal from "../components/PaymentModal";
import AddCustomerModal from "../components/AddCustomerModal";
import ContactCard from "../components/ContactCard";
import AddContactModal from "../components/AddContactModal";
import DeleteContactModal from "../components/DeleteContactModal";
import ConfirmModal from "../components/ConfirmModal";
import NotifyContactModal from "../components/NotifyContactModal";
import type { Contact, CustomerPayment, DraftInvoice } from "../types";

type SendPaymentStep = "closed" | "confirm" | "pickContact";

type Props = {
  customerId: string;
  onBack: () => void;
  onSelectInvoice: (invoiceId: string) => void;
};

/** Icon per business type, matching the customer list's business-type chip. */
const BUSINESS_TYPE_ICON: Record<BusinessType, LucideIcon> = {
  Grocery: ShoppingBasket,
  Restaurant: UtensilsCrossed,
  Roastry: Coffee,
};

const LANGUAGE_LABELS: Record<string, string> = {
  am: "Amharic",
  ar: "Arabic",
  en: "English",
};

/** How many of the customer's latest payments the Recent Payments section shows. */
const RECENT_PAYMENTS_SHOWN = 3;

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  creditcard: "Card",
  banktransfer: "Bank transfer",
};

function formatPaymentMode(mode: string) {
  return PAYMENT_MODE_LABELS[mode.toLowerCase()] ?? mode;
}

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
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[] | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [sendingPayment, setSendingPayment] = useState<CustomerPayment | null>(null);
  const [sendPaymentStep, setSendPaymentStep] = useState<SendPaymentStep>("closed");
  const [isSendingPayment, setIsSendingPayment] = useState(false);
  const [notifyBanner, setNotifyBanner] = useState<"success" | "failed" | null>(null);
  const [notifyRetry, setNotifyRetry] = useState<(() => void) | null>(null);

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
    fetchCustomerPayments(customerId)
      .then((list) => {
        if (!cancelled) setPayments(list.slice(0, RECENT_PAYMENTS_SHOWN));
      })
      .catch((e) => {
        if (!cancelled) setPaymentsError(e instanceof Error ? e.message : "Failed to load payments");
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  function handleSubmitPayment(
    amount: number,
    _discount?: number,
    _createNewDraft?: boolean,
    notify?: boolean,
    notifyContactIds?: string[],
  ) {
    if (!customer) return;
    setIsRecordingPayment(true);
    recordCustomerPayment(customer.contact_id, amount, notify, notifyContactIds)
      .then(() => {
        setIsPaymentModalOpen(false);
        fetchCustomerPayments(customerId)
          .then((list) => {
            setPayments(list.slice(0, RECENT_PAYMENTS_SHOWN));
            setPaymentsError(null);
          })
          .catch(() => {});
        return fetchCustomerById(customerId).then(setCustomer);
      })
      .catch((e) => setPaymentError(e instanceof Error ? e.message : "Failed to record payment"))
      .finally(() => setIsRecordingPayment(false));
  }

  /**
   * Sends the WhatsApp payment confirmation template for one of the
   * customer's existing payments: its amount and date, with the customer's
   * current total balance due. Only sends the message — the payment itself
   * is untouched.
   */
  function runSendPayment(payment: CustomerPayment, notifyContactIds?: string[]) {
    if (!customer) return;
    const customerIdForSend = customer.contact_id;
    const retry = () => runSendPayment(payment, notifyContactIds);
    setIsSendingPayment(true);
    setNotifyBanner(null);
    sendCustomerPaymentNotification(customerIdForSend, payment.payment_id, notifyContactIds)
      .then((result) => {
        setNotifyBanner(result.notified ? "success" : "failed");
        setNotifyRetry(result.notified ? null : () => retry);
      })
      .catch(() => {
        setNotifyBanner("failed");
        setNotifyRetry(() => retry);
      })
      .finally(() => {
        setIsSendingPayment(false);
        setSendPaymentStep("closed");
      });
  }

  function handleConfirmSendPayment() {
    if (!customer || !sendingPayment) return;
    if (getContactList(customer).length > 1) {
      setSendPaymentStep("pickContact");
      return;
    }
    const primaryId = getPrimaryContact(customer)?.contact_person_id;
    runSendPayment(sendingPayment, primaryId ? [primaryId] : undefined);
  }

  function handleAddContact(payload: { first_name: string; phone: string; is_primary_contact: boolean }) {
    if (!customer) return;
    setIsSavingContact(true);
    setContactError(null);
    addCustomerContact(customer.contact_id, payload)
      .then((updated) => {
        setCustomer(updated);
        setIsAddContactOpen(false);
      })
      .catch((e) => setContactError(e instanceof Error ? e.message : "Failed to add contact"))
      .finally(() => setIsSavingContact(false));
  }

  function handleSaveContact(contactPersonId: string, payload: { first_name: string; phone: string }) {
    if (!customer) return Promise.resolve();
    setIsSavingContact(true);
    // The legacy synthetic contact (customers created before this feature, with
    // only a top-level phone/mobile) has no real Zoho contact-person id to PUT
    // to — "editing" it instead creates the customer's first real contact person.
    const save =
      contactPersonId === LEGACY_CONTACT_ID
        ? addCustomerContact(customer.contact_id, { ...payload, is_primary_contact: true })
        : updateCustomerContact(customer.contact_id, contactPersonId, payload);
    return save.then((updated) => {
      setCustomer(updated);
    }).finally(() => setIsSavingContact(false));
  }

  function handleDeleteContact() {
    if (!customer || !deletingContactId) return;
    setIsSavingContact(true);
    setContactError(null);
    deleteCustomerContact(customer.contact_id, deletingContactId)
      .then((updated) => {
        setCustomer(updated);
        setDeletingContactId(null);
      })
      .catch((e) => setContactError(e instanceof Error ? e.message : "Failed to delete contact"))
      .finally(() => setIsSavingContact(false));
  }

  function handleMakePrimary(contactPersonId: string) {
    if (!customer) return;
    setIsSavingContact(true);
    setContactError(null);
    markCustomerContactPrimary(customer.contact_id, contactPersonId)
      .then(setCustomer)
      .catch((e) => setContactError(e instanceof Error ? e.message : "Failed to set primary contact"))
      .finally(() => setIsSavingContact(false));
  }

  function handleToggleStatus() {
    if (!customer || isTogglingStatus) return;
    setIsTogglingStatus(true);
    setStatusError(null);
    setCustomerActive(customer.contact_id, customer.status !== "active")
      .then(setCustomer)
      .catch((e) => setStatusError(e instanceof Error ? e.message : "Failed to update customer status"))
      .finally(() => setIsTogglingStatus(false));
  }

  const contacts = customer ? getContactList(customer) : [];
  const { city, district, street, locationLink } = parseAddress(customer ? getRawContactAddress(customer) : undefined);
  const businessType = customer ? getRawContactBusinessType(customer) : undefined;
  const BusinessTypeIcon = businessType ? BUSINESS_TYPE_ICON[businessType] : null;
  const preferredLanguage = customer ? getRawContactPreferredLanguage(customer) : undefined;
  const languageLabel = preferredLanguage ? LANGUAGE_LABELS[preferredLanguage] : undefined;

  return (
    <div className="invoice-details">
      <div className="invoice-details__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        {customer && (
          <div className="page-header__actions">
            <button
              type="button"
              className="icon-btn"
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              aria-label={customer.status === "active" ? "Mark inactive" : "Mark active"}
              title={customer.status === "active" ? "Mark inactive" : "Mark active"}
            >
              {customer.status === "active" ? <UserX size={16} /> : <UserCheck size={16} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setIsEditCustomerOpen(true)}
              aria-label="Edit customer"
              title="Edit customer"
            >
              <Pencil size={16} />
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}
      {statusError && <div className="form-error">{statusError}</div>}

      {!customer && !error && <div className="items-area__empty">Loading...</div>}

      {customer && (
        <>
          <div className="invoice-details__customer">
            {customer.contact_name || customer.company_name}
            {customer.status !== "active" && (
              <span className="badge customer-card__inactive-badge">inactive</span>
            )}
          </div>

          <div className="invoice-details__summary">
            <div className="invoice-details__summary-left">
              {customer.company_name && customer.company_name !== customer.contact_name && (
                <div className="invoice-details__summary-row">{customer.company_name}</div>
              )}
              {(district || city || businessType || locationLink) && (
                <div className="customer-card__tags">
                  {(district || city) && (
                    <span className="location-chip">
                      <MapPin className="location-chip__icon" size={11} />
                      {district ? (
                        <>
                          <span className="location-chip__district">{district}</span>
                          {city && (
                            <>
                              <span className="location-chip__divider">·</span>
                              <span className="location-chip__city">{city}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="location-chip__district">{city}</span>
                      )}
                    </span>
                  )}
                  {businessType && BusinessTypeIcon && (
                    <span className={`business-type-chip business-type-chip--${businessType.toLowerCase()}`}>
                      <BusinessTypeIcon size={11} />
                      {businessType}
                    </span>
                  )}
                  {locationLink && (
                    <a
                      href={locationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="maps-link-icon"
                      title="Open in Google Maps"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
              {street && <div className="invoice-details__summary-row">{street}</div>}
              {(customer.customer_sub_type || languageLabel) && (
                <div className="invoice-details__summary-row invoice-details__summary-row--muted">
                  {[
                    customer.customer_sub_type &&
                      customer.customer_sub_type[0].toUpperCase() + customer.customer_sub_type.slice(1),
                    languageLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
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
            <div
              className="line-items__header"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              Contacts
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setContactError(null);
                  setIsAddContactOpen(true);
                }}
                aria-label="Add contact"
                title="Add contact"
              >
                <UserPlus size={16} />
              </button>
            </div>
            {contactError && !deletingContactId && !isAddContactOpen && (
              <div className="form-error">{contactError}</div>
            )}
            {contacts.length === 0 ? (
              <div className="items-area__empty">No contacts on file</div>
            ) : (
              <div className="contact-card-list">
                {contacts.map((c) => (
                  <ContactCard
                    key={c.contact_person_id}
                    contact={c}
                    isSaving={isSavingContact}
                    onSave={(payload) => handleSaveContact(c.contact_person_id, payload)}
                    onDelete={
                      c.contact_person_id === LEGACY_CONTACT_ID
                        ? undefined
                        : () => {
                            setContactError(null);
                            setDeletingContactId(c.contact_person_id);
                          }
                    }
                    onMakePrimary={() => handleMakePrimary(c.contact_person_id)}
                  />
                ))}
              </div>
            )}
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
                      <div className="draft-card__top-right" onClick={(e) => e.stopPropagation()}>
                        <span className="draft-card__status">{formatStatus(invoice.status)}</span>
                        <DownloadInvoiceButton invoiceId={invoice.invoice_id} invoiceNumber={invoice.invoice_number} />
                      </div>
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

          {notifyBanner === "success" && (
            <div className="notify-banner notify-banner--success">
              <CheckCircle2 className="notify-banner__icon" size={14} />
              Customer notified on WhatsApp.
            </div>
          )}

          {notifyBanner === "failed" && (
            <div className="notify-banner notify-banner--failed">
              <TriangleAlert className="notify-banner__icon" size={14} />
              <span>The WhatsApp notification couldn't be sent.</span>
              <button
                type="button"
                className="link-btn"
                disabled={isSendingPayment}
                onClick={() => notifyRetry?.()}
              >
                {isSendingPayment ? "Retrying..." : "Try again"}
              </button>
            </div>
          )}

          <div className="line-items">
            <div className="line-items__header">Recent Payments</div>
            {paymentsError ? (
              <div className="form-error">{paymentsError}</div>
            ) : payments === null ? (
              <div className="items-area__empty">Loading...</div>
            ) : payments.length === 0 ? (
              <div className="items-area__empty">No payments yet</div>
            ) : (
              <div className="draft-list">
                {payments.map((payment) => (
                  <div key={payment.payment_id} className="draft-card">
                    <div className="draft-card__top">
                      <span className="draft-card__invoice-number">{payment.payment_number || "Payment"}</span>
                      <div className="draft-card__top-right">
                        {payment.payment_mode && (
                          <span className="draft-card__status">{formatPaymentMode(payment.payment_mode)}</span>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            setSendingPayment(payment);
                            setSendPaymentStep("confirm");
                          }}
                          disabled={isSendingPayment}
                          aria-label={`Send payment of ${currency(payment.amount)} on WhatsApp`}
                          title="Send payment message on WhatsApp"
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="draft-card__bottom">
                      <span className="draft-card__scheduled">{payment.date}</span>
                      <span className="draft-card__total">{currency(payment.amount)}</span>
                    </div>
                  </div>
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
          prefillAmount={false}
          isSaving={isRecordingPayment}
          submitError={paymentError}
          customer={customer}
          onCancel={() => setIsPaymentModalOpen(false)}
          onSubmit={handleSubmitPayment}
        />
      )}

      {sendPaymentStep === "confirm" && sendingPayment && customer && (
        <ConfirmModal
          title="Send payment message?"
          message={`Send the payment of ${currency(sendingPayment.amount)} on ${sendingPayment.date} to ${customer.contact_name || customer.company_name} on WhatsApp, with their current balance due?`}
          confirmLabel={isSendingPayment ? "Sending..." : "Send"}
          isConfirming={isSendingPayment}
          onConfirm={handleConfirmSendPayment}
          onCancel={() => setSendPaymentStep("closed")}
        />
      )}

      {sendPaymentStep === "pickContact" && sendingPayment && customer && (
        <NotifyContactModal
          customer={customer}
          isSaving={isSendingPayment}
          onCancel={() => setSendPaymentStep("closed")}
          onConfirm={(contactPersonIds) => runSendPayment(sendingPayment, contactPersonIds)}
        />
      )}

      {isAddContactOpen && (
        <AddContactModal
          isSaving={isSavingContact}
          error={contactError}
          onCancel={() => setIsAddContactOpen(false)}
          onConfirm={handleAddContact}
        />
      )}

      {deletingContactId && (
        <DeleteContactModal
          contactName={contacts.find((c) => c.contact_person_id === deletingContactId)?.first_name ?? ""}
          isDeleting={isSavingContact}
          error={contactError}
          onCancel={() => setDeletingContactId(null)}
          onConfirm={handleDeleteContact}
        />
      )}

      <AddCustomerModal
        open={isEditCustomerOpen}
        customer={customer}
        onClose={() => setIsEditCustomerOpen(false)}
        onSaved={setCustomer}
      />
    </div>
  );
}
