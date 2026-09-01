import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, UserPlus } from "lucide-react";
import {
  fetchCustomerById,
  fetchCustomerDraftInvoices,
  recordCustomerPayment,
  addCustomerContact,
  updateCustomerContact,
  deleteCustomerContact,
  markCustomerContactPrimary,
} from "../lib/api";
import { currency } from "../lib/currency";
import { getContactList, LEGACY_CONTACT_ID } from "../lib/contacts";
import ClickableCard from "../components/ClickableCard";
import PaymentModal from "../components/PaymentModal";
import AddCustomerModal from "../components/AddCustomerModal";
import ContactCard from "../components/ContactCard";
import AddContactModal from "../components/AddContactModal";
import DeleteContactModal from "../components/DeleteContactModal";
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
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

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

  function handleSubmitPayment(
    amount: number,
    _discount?: number,
    _createNewDraft?: boolean,
    notify?: boolean,
    notifyContactId?: string,
  ) {
    if (!customer) return;
    setIsRecordingPayment(true);
    recordCustomerPayment(customer.contact_id, amount, notify, notifyContactId)
      .then(() => {
        setIsPaymentModalOpen(false);
        return fetchCustomerById(customerId).then(setCustomer);
      })
      .catch((e) => setPaymentError(e instanceof Error ? e.message : "Failed to record payment"))
      .finally(() => setIsRecordingPayment(false));
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

  const contacts = customer ? getContactList(customer) : [];

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
          customer={customer}
          onCancel={() => setIsPaymentModalOpen(false)}
          onSubmit={handleSubmitPayment}
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
