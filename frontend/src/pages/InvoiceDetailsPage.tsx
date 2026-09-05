import { useEffect, useState } from "react";
import { ArrowLeft, Check, Pencil, Printer } from "lucide-react";
import {
  fetchInvoiceById,
  fetchCustomerById,
  markInvoiceAsSent,
  recordInvoicePayment,
  splitInvoiceToSelectedItems,
  updateInvoiceDate,
  updateInvoiceLineItems,
  updateInvoiceCustomer,
  invoicePdfUrl,
} from "../lib/api";
import { currency } from "../lib/currency";
import { buildScheduleOptions } from "../lib/scheduledDate";
import { formatInvoiceForCopy } from "../lib/itemSummary";
import { printPdfUrl } from "../lib/printPdf";
import { getContactList, getPrimaryContact } from "../lib/contacts";
import ResendButton from "../components/ResendButton";
import PaymentModal from "../components/PaymentModal";
import DayPickerModal from "../components/DayPickerModal";
import SplitConfirmModal from "../components/SplitConfirmModal";
import CopyButton from "../components/CopyButton";
import NotifyContactModal from "../components/NotifyContactModal";
import EditLineItemModal from "../components/EditLineItemModal";
import ConfirmModal from "../components/ConfirmModal";
import ChangeCustomerModal from "../components/ChangeCustomerModal";
import type { Contact, InvoiceDetail, InvoiceDetailLineItem } from "../types";

type Props = {
  invoiceId: string;
  onBack: () => void;
};

type MarkSentNotifyStep = "closed" | "confirmNotify" | "pickContact";

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
  const [customer, setCustomer] = useState<Contact | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSplitConfirmOpen, setIsSplitConfirmOpen] = useState(false);
  const [markSentNotifyStep, setMarkSentNotifyStep] = useState<MarkSentNotifyStep>("closed");
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [scheduleOptions] = useState(() => buildScheduleOptions());
  const [editedLineItems, setEditedLineItems] = useState<InvoiceDetailLineItem[] | null>(null);
  const [editingItem, setEditingItem] = useState<InvoiceDetailLineItem | null>(null);
  const [isSavingLineItems, setIsSavingLineItems] = useState(false);
  const [lineItemsSaveError, setLineItemsSaveError] = useState<string | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isChangeCustomerOpen, setIsChangeCustomerOpen] = useState(false);
  const [isChangingCustomer, setIsChangingCustomer] = useState(false);
  const [changeCustomerError, setChangeCustomerError] = useState<string | null>(null);

  const [customerRetryToken, setCustomerRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchInvoiceById(invoiceId)
      .then((inv) => {
        if (!cancelled) setInvoice(inv);
        if (!cancelled) {
          if (!inv.customer_id) {
            setCustomer(null);
            setCustomerError("This invoice has no linked customer, so it can't be paid from here.");
            return;
          }
          setCustomerError(null);
          fetchCustomerById(inv.customer_id)
            .then((c) => {
              if (!cancelled) setCustomer(c);
            })
            .catch((e) => {
              if (!cancelled) {
                setCustomer(null);
                setCustomerError(e instanceof Error ? e.message : "Failed to load customer contact info");
              }
            });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load invoice");
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId, customerRetryToken]);

  function toggleItemSelected(lineItemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineItemId)) next.delete(lineItemId);
      else next.add(lineItemId);
      return next;
    });
  }

  // Unsaved line-item edits live only in local state until explicitly saved
  // (header checkmark) or auto-saved (mark as sent / record payment / back
  // guard). null means "no unsaved edits — use invoice.line_items as-is".
  const displayLineItems = editedLineItems ?? invoice?.line_items ?? [];
  const isLineItemsDirty = editedLineItems !== null;

  // Taxes/discounts aren't tracked client-side, so the edit's effect on
  // subtotal is assumed to flow straight through to total/balance — exact
  // when there's no tax/discount on the invoice.
  const editedSubtotal = editedLineItems
    ? editedLineItems.reduce((sum, item) => sum + item.item_total, 0)
    : invoice?.sub_total ?? 0;
  const subtotalDelta = editedSubtotal - (invoice?.sub_total ?? 0);
  const displayTotal = (invoice?.total ?? 0) + subtotalDelta;
  const displayBalance = (invoice?.balance ?? 0) + subtotalDelta;

  function handleEditItemConfirm(quantity: number, rate: number) {
    if (!editingItem || !invoice) return;
    const base = editedLineItems ?? invoice.line_items;
    const next = base.map((li) =>
      li.line_item_id === editingItem.line_item_id ? { ...li, quantity, rate, item_total: quantity * rate } : li,
    );
    setEditedLineItems(next);
    setEditingItem(null);
  }

  /** Persists unsaved line-item edits, if any. No-op (resolved promise) when clean. */
  function saveLineItemsIfDirty(): Promise<void> {
    if (!invoice || !editedLineItems) return Promise.resolve();
    setLineItemsSaveError(null);
    return updateInvoiceLineItems(
      invoice.invoice_id,
      editedLineItems.map((li) => ({
        item_id: li.item_id,
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        unit: li.unit,
      })),
    ).then((updatedInvoice) => {
      setInvoice(updatedInvoice);
      setEditedLineItems(null);
    });
  }

  function handleSaveLineItemsClick() {
    setIsSavingLineItems(true);
    saveLineItemsIfDirty()
      .catch((e) => setLineItemsSaveError(e instanceof Error ? e.message : "Failed to save line item changes"))
      .finally(() => setIsSavingLineItems(false));
  }

  function handleBackClick() {
    if (isLineItemsDirty) {
      setIsLeaveConfirmOpen(true);
      return;
    }
    onBack();
  }

  // A selection only matters if it's a draft (splitting a sent invoice's
  // line items isn't supported) and it's a strict subset of the items —
  // none selected or all selected both mean "act on the whole invoice".
  const isPartialSelection =
    !!invoice &&
    invoice.status === "draft" &&
    selectedItemIds.size > 0 &&
    selectedItemIds.size < invoice.line_items.length;

  const selectedItemsTotal = displayLineItems
    .filter((item) => selectedItemIds.has(item.line_item_id))
    .reduce((sum, item) => sum + item.item_total, 0);

  /** Trims this invoice down to the selected items, optionally splitting the rest into a new draft first. */
  function splitToSelection(createNewDraft: boolean): Promise<void> {
    if (!invoice) return Promise.resolve();
    return splitInvoiceToSelectedItems(invoice.invoice_id, Array.from(selectedItemIds), createNewDraft).then(
      (splitInvoice) => {
        setInvoice(splitInvoice);
        setSelectedItemIds(new Set());
        // A split changes line_items server-side, so any local edits keyed
        // by line_item_id may reference items no longer present — discard.
        setEditedLineItems(null);
      },
    );
  }

  function handleSubmitPayment(
    amount: number,
    discount?: number,
    createNewDraft?: boolean,
    notify?: boolean,
    notifyContactId?: string,
  ) {
    if (!invoice) return;
    setIsRecordingPayment(true);
    saveLineItemsIfDirty()
      .then(() => (isPartialSelection ? splitToSelection(!!createNewDraft) : Promise.resolve()))
      .then(() => recordInvoicePayment(invoice.invoice_id, amount, discount, notify, notifyContactId))
      .then(() => {
        setIsPaymentModalOpen(false);
        return fetchInvoiceById(invoiceId).then(setInvoice);
      })
      .catch((e) => setPaymentError(e instanceof Error ? e.message : "Failed to record payment"))
      .finally(() => setIsRecordingPayment(false));
  }

  function handleMarkAsSentClick() {
    if (!invoice) return;
    if (isPartialSelection) {
      setActionError(null);
      setIsSplitConfirmOpen(true);
      return;
    }
    setActionError(null);
    setMarkSentNotifyStep("confirmNotify");
  }

  function runMarkAsSent(notify: boolean, notifyContactId?: string) {
    if (!invoice) return;
    setIsMarkingSent(true);
    setActionError(null);
    saveLineItemsIfDirty()
      .then(() => markInvoiceAsSent(invoice.invoice_id, notify, notifyContactId))
      .then(() => {
        setMarkSentNotifyStep("closed");
        return fetchInvoiceById(invoiceId).then(setInvoice);
      })
      .catch((e) => setActionError(e instanceof Error ? e.message : "Failed to mark invoice as sent"))
      .finally(() => setIsMarkingSent(false));
  }

  function handleYesNotifyOnSent() {
    if (!customer) {
      runMarkAsSent(true);
      return;
    }
    const contacts = getContactList(customer);
    if (contacts.length > 1) {
      setMarkSentNotifyStep("pickContact");
      return;
    }
    runMarkAsSent(true, getPrimaryContact(customer)?.contact_person_id);
  }

  function handleSplitConfirm(createNewDraft: boolean) {
    setIsMarkingSent(true);
    setActionError(null);
    splitToSelection(createNewDraft)
      .then(() => {
        setIsSplitConfirmOpen(false);
        setIsMarkingSent(false);
        setMarkSentNotifyStep("confirmNotify");
      })
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : "Failed to split invoice");
        setIsMarkingSent(false);
      });
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

  function handleChangeCustomer(contact: Contact) {
    if (!invoice) return;
    setIsChangingCustomer(true);
    setChangeCustomerError(null);
    updateInvoiceCustomer(invoice.invoice_id, contact.contact_id)
      .then(() => {
        setIsChangeCustomerOpen(false);
        // Re-runs the main load effect, which re-fetches both the invoice
        // (now under its new customer_id) and that customer's contact info.
        setCustomerRetryToken((n) => n + 1);
      })
      .catch((e) => setChangeCustomerError(e instanceof Error ? e.message : "Failed to change customer"))
      .finally(() => setIsChangingCustomer(false));
  }

  return (
    <div className="invoice-details">
      <div className="invoice-details__header">
        <button type="button" className="icon-btn" onClick={handleBackClick} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        {invoice && (
          <div className="page-header__actions">
            <CopyButton getText={() => formatInvoiceForCopy(invoice.invoice_number, displayLineItems)} />
            <button
              type="button"
              className="icon-btn"
              onClick={() => printPdfUrl(invoicePdfUrl(invoice.invoice_id))}
              aria-label="Print invoice"
              title="Print invoice"
            >
              <Printer size={14} />
            </button>
            {isLineItemsDirty && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Save line item changes"
                title="Save line item changes"
                onClick={handleSaveLineItemsClick}
                disabled={isSavingLineItems}
              >
                <Check size={14} />
              </button>
            )}
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
          <div className="invoice-details__customer">
            {invoice.customer_name}
            {invoice.status === "draft" && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setChangeCustomerError(null);
                  setIsChangeCustomerOpen(true);
                }}
              >
                Change customer
              </button>
            )}
          </div>

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

          {lineItemsSaveError && <div className="form-error">{lineItemsSaveError}</div>}

          <div className="line-items">
            <div className="line-items__header">Items</div>
            {displayLineItems.map((item) => {
              const isSelected = selectedItemIds.has(item.line_item_id);
              return (
                <div
                  key={item.line_item_id}
                  className={`invoice-item-row${isSelected ? " invoice-item-row--selected" : ""}`}
                >
                  <div
                    className="invoice-item-row__main"
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
                    style={{ display: "flex", gap: 10, cursor: "pointer" }}
                  >
                    <span className={`checkbox${isSelected ? " checkbox--checked" : ""}`} aria-hidden="true">
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div>
                      <div className="line-item__name">{item.name}</div>
                      {item.description && (
                        <div className="line-item__meta">{item.description}</div>
                      )}
                      <div className="line-item__meta">
                        {item.quantity} {item.unit} × {currency(item.rate)}
                      </div>
                    </div>
                  </div>
                  <div className="line-item__right">
                    <span className="line-item__total">{currency(item.item_total)}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Edit ${item.name}`}
                      title="Edit item"
                      onClick={() => setEditingItem(item)}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="invoice-details__totals">
            <div className="invoice-details__totals-row">
              <span>Subtotal</span>
              <span>{currency(editedSubtotal)}</span>
            </div>
            <div className="invoice-details__totals-row">
              <span>Total</span>
              <span>{currency(displayTotal)}</span>
            </div>
            <div className="invoice-details__totals-row invoice-details__totals-row--balance">
              <span>Balance due</span>
              <span>{currency(displayBalance)}</span>
            </div>
          </div>

          {isPartialSelection && (
            <div className="day-warning">
              {selectedItemIds.size} of {invoice.line_items.length} items selected — this action will apply to only
              those items.
            </div>
          )}

          {actionError && <div className="form-error">{actionError}</div>}

          {customerError && invoice.balance > 0 && (
            <div className="form-error">
              {customerError}
              {invoice.customer_id && (
                <>
                  {" — "}
                  <button type="button" className="link-btn" onClick={() => setCustomerRetryToken((n) => n + 1)}>
                    Retry
                  </button>
                </>
              )}
            </div>
          )}

          <div className="invoice-details__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPaymentError(null);
                setIsPaymentModalOpen(true);
              }}
              disabled={displayBalance <= 0 || !customer}
            >
              Record Payment
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleMarkAsSentClick}
              disabled={invoice.status !== "draft"}
            >
              {isMarkingSent ? "Marking..." : "Mark as Sent"}
            </button>
          </div>
        </>
      )}

      {isPaymentModalOpen && invoice && customer && (
        <PaymentModal
          title={invoice.invoice_number}
          outstandingBalance={isPartialSelection ? selectedItemsTotal : displayBalance}
          isSaving={isRecordingPayment}
          submitError={paymentError}
          allowDiscount
          itemsToSplitCount={isPartialSelection ? invoice.line_items.length - selectedItemIds.size : undefined}
          customer={customer}
          onCancel={() => setIsPaymentModalOpen(false)}
          onSubmit={handleSubmitPayment}
        />
      )}

      {editingItem && (
        <EditLineItemModal
          item={editingItem}
          currencySymbol={invoice?.currency_symbol ?? ""}
          onCancel={() => setEditingItem(null)}
          onConfirm={handleEditItemConfirm}
        />
      )}

      {isLeaveConfirmOpen && (
        <ConfirmModal
          title="Unsaved changes"
          message="You have unsaved changes to this invoice. Leave without saving?"
          confirmLabel="Leave without saving"
          onConfirm={() => {
            setIsLeaveConfirmOpen(false);
            onBack();
          }}
          onCancel={() => setIsLeaveConfirmOpen(false)}
        />
      )}

      {isSplitConfirmOpen && invoice && (
        <SplitConfirmModal
          selectedCount={selectedItemIds.size}
          totalCount={invoice.line_items.length}
          isSaving={isMarkingSent}
          error={actionError}
          onSplitAndContinue={() => handleSplitConfirm(true)}
          onDropAndContinue={() => handleSplitConfirm(false)}
          onCancel={() => setIsSplitConfirmOpen(false)}
        />
      )}

      {markSentNotifyStep === "confirmNotify" && invoice && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={() => setMarkSentNotifyStep("closed")} />
          <div className="modal">
            <div className="modal__title">Notify Customer?</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              Send a WhatsApp notification that this invoice was sent?
            </div>
            {actionError && <div className="form-error">{actionError}</div>}
            <div className="invoice-details__actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={isMarkingSent}
                onClick={() => runMarkAsSent(false)}
              >
                {isMarkingSent ? "Saving..." : "No, don't notify"}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={isMarkingSent}
                onClick={handleYesNotifyOnSent}
              >
                {isMarkingSent ? "Saving..." : "Yes, notify"}
              </button>
            </div>
          </div>
        </div>
      )}

      {markSentNotifyStep === "pickContact" && customer && (
        <NotifyContactModal
          customer={customer}
          isSaving={isMarkingSent}
          error={actionError}
          onCancel={() => setMarkSentNotifyStep("closed")}
          onConfirm={(contactPersonId) => runMarkAsSent(true, contactPersonId)}
        />
      )}

      {isChangeCustomerOpen && invoice && (
        <ChangeCustomerModal
          currentCustomerName={invoice.customer_name}
          isSaving={isChangingCustomer}
          error={changeCustomerError}
          onCancel={() => setIsChangeCustomerOpen(false)}
          onConfirm={handleChangeCustomer}
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
