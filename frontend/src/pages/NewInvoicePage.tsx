import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Pause, Play, Trash2 } from "lucide-react";
import AddItemModal from "../components/AddItemModal";
import ConfirmModal from "../components/ConfirmModal";
import CustomerCombobox from "../components/CustomerCombobox";
import DraftPicker from "../components/DraftPicker";
import SchedulePicker from "../components/SchedulePicker";
import InvoiceLineItemsList from "../components/InvoiceLineItemsList";
import {
  createInvoice,
  fetchCustomerDraftInvoices,
  fetchCustomers,
  fetchInvoiceById,
  fetchItems,
} from "../lib/api";
import { currency } from "../lib/currency";
import type { HungInvoice } from "../lib/hungInvoice";
import type {
  CatalogItem,
  Cart,
  Contact,
  DraftInvoice,
  InvoiceDetailLineItem,
  InvoiceLineItem,
  InvoiceMode,
  ScheduledDate,
} from "../types";

const EXCLUDE_MARKER = "###";

function cartFromDraftLineItems(lineItems: InvoiceDetailLineItem[], draftId: string): Cart {
  const cart: Cart = {};
  for (const item of lineItems) {
    const excludeFromTelegram = item.description.includes(EXCLUDE_MARKER);
    cart[item.item_id] = {
      description: item.description.replace(new RegExp(EXCLUDE_MARKER, "g"), "").trim(),
      quantity: item.quantity,
      rate: item.rate,
      excludeFromTelegram,
      fromDraftId: draftId,
    };
  }
  return cart;
}

type Props = {
  cart: Cart;
  onCartChange: (cart: Cart) => void;
  selectedContactId: string;
  onSelectedContactIdChange: (contactId: string) => void;
  scheduledDate: ScheduledDate;
  onScheduledDateChange: (date: ScheduledDate) => void;
  mode: InvoiceMode;
  onModeChange: (mode: InvoiceMode) => void;
  draftId: string | null;
  onDraftIdChange: (draftId: string | null) => void;
  /** The invoice put aside with "Hang", if any (a single slot). */
  hungInvoice: HungInvoice | null;
  onHungInvoiceChange: (invoice: HungInvoice | null) => void;
};

/**
 * Invoice-creation form: pick a customer, an optional scheduled date, and
 * line items. A top toggle switches between "Create New Invoice" (always
 * posts a brand-new invoice, cart starts empty) and "Update Draft" (a second
 * dropdown lets you pick which of the customer's existing drafts, by invoice
 * number, to load and update).
 *
 * "Hang" puts the whole form (either mode) aside into a single slot and
 * clears it for the next order; "Resume" brings it back, swapping with
 * whatever is on the form at the time so nothing is lost.
 */
export default function NewInvoicePage({
  cart,
  onCartChange,
  selectedContactId,
  onSelectedContactIdChange: setSelectedContactId,
  scheduledDate,
  onScheduledDateChange: setScheduledDate,
  mode,
  onModeChange: setMode,
  draftId,
  onDraftIdChange: setDraftId,
  hungInvoice,
  onHungInvoiceChange,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [itemToOpen, setItemToOpen] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customerDrafts, setCustomerDrafts] = useState<DraftInvoice[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [isLoadingDraftItems, setIsLoadingDraftItems] = useState(false);
  // Opt-out, not opt-in: sending to Telegram is the default on every
  // submission, and resets back to checked after each one so skipping it
  // is always a deliberate choice, never a leftover setting.
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [hungConfirm, setHungConfirm] = useState<"replace" | "remove" | null>(null);
  const draftsFetchIdRef = useRef(0);
  const draftItemsFetchIdRef = useRef(0);

  useEffect(() => {
    fetchCustomers().then(setContacts);
    fetchItems().then(setCatalogItems);
  }, []);

  const lineItems: InvoiceLineItem[] = useMemo(() => {
    return Object.entries(cart).map(([item_id, line]) => {
      const catalogItem = catalogItems.find((i) => i.item_id === item_id);
      return {
        item_id,
        name: catalogItem?.name ?? "",
        unit: catalogItem?.unit ?? "",
        ...line,
      };
    });
  }, [cart, catalogItems]);

  const invoiceTotal = lineItems.reduce((sum, li) => sum + li.rate * li.quantity, 0);

  // Manually-added lines (no draft origin) always carry over between
  // customer/mode/draft changes; only draft-origin lines get replaced.
  function keepManualLines(currentCart: Cart): Cart {
    return Object.fromEntries(Object.entries(currentCart).filter(([, line]) => line.fromDraftId === undefined));
  }

  function loadDraftsForCustomer(contactId: string) {
    const fetchId = ++draftsFetchIdRef.current;
    setIsLoadingDrafts(true);
    setCustomerDrafts([]);
    fetchCustomerDraftInvoices(contactId)
      .then((drafts) => {
        if (draftsFetchIdRef.current !== fetchId) return;
        setCustomerDrafts(drafts);
      })
      .catch(() => {})
      .finally(() => {
        if (draftsFetchIdRef.current === fetchId) setIsLoadingDrafts(false);
      });
  }

  function selectContact(contact: Contact) {
    setSelectedContactId(contact.contact_id);
    setDraftId(null);
    onCartChange(keepManualLines(cart));
    // Fetched regardless of mode: "new" mode uses this only to show a
    // subtle "this customer has a draft" hint, while "update" mode uses it
    // to populate the draft picker below.
    loadDraftsForCustomer(contact.contact_id);
  }

  function selectMode(nextMode: InvoiceMode) {
    setMode(nextMode);
    setDraftId(null);
    onCartChange(keepManualLines(cart));
  }

  function selectDraft(nextDraftId: string) {
    setDraftId(nextDraftId);
    const fetchId = ++draftItemsFetchIdRef.current;
    setIsLoadingDraftItems(true);
    fetchInvoiceById(nextDraftId)
      .then((draft) => {
        if (draftItemsFetchIdRef.current !== fetchId) return;
        onCartChange({ ...keepManualLines(cart), ...cartFromDraftLineItems(draft.line_items, nextDraftId) });
      })
      .catch(() => {})
      .finally(() => {
        if (draftItemsFetchIdRef.current === fetchId) setIsLoadingDraftItems(false);
      });
  }

  function commitItem(
    itemId: string,
    values: { description: string; quantity: string; rate: string; excludeFromTelegram: boolean },
  ) {
    onCartChange({
      ...cart,
      [itemId]: {
        description: values.description,
        quantity: Number(values.quantity) || 0,
        rate: Number(values.rate) || 0,
        excludeFromTelegram: values.excludeFromTelegram,
        fromDraftId: cart[itemId]?.fromDraftId,
      },
    });
  }

  function removeItem(itemId: string) {
    const next = { ...cart };
    delete next[itemId];
    onCartChange(next);
  }

  function openItemInModal(itemId: string) {
    setItemToOpen(itemId);
    setIsAddItemOpen(true);
  }

  async function submitInvoice() {
    if (!selectedContactId || lineItems.length === 0) return;
    if (mode === "update" && !draftId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createInvoice({
        contact_id: selectedContactId,
        ...(scheduledDate ? { date: scheduledDate } : {}),
        ...(mode === "update" && draftId ? { invoice_id: draftId } : {}),
        ...(notifyTelegram ? {} : { skip_telegram: true }),
        line_items: lineItems.map((li) => ({
          item_id: li.item_id,
          description: li.excludeFromTelegram ? `${li.description} ###` : li.description,
          quantity: li.quantity,
          rate: li.rate,
          unit: li.unit,
        })),
      });
      onCartChange({});
      setSelectedContactId("");
      setScheduledDate(null);
      setDraftId(null);
      setCustomerDrafts([]);
      setNotifyTelegram(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit invoice");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLoadingItems = isLoadingDraftItems;
  const hasWork = !!selectedContactId || lineItems.length > 0 || !!scheduledDate || !!draftId;

  /** Loads an invoice into the form, cancelling any draft fetch still in flight for the previous one. */
  function loadIntoForm(invoice: Omit<HungInvoice, "hungAt"> | null) {
    draftItemsFetchIdRef.current++;
    setIsLoadingDraftItems(false);
    onCartChange(invoice?.cart ?? {});
    setSelectedContactId(invoice?.contactId ?? "");
    setScheduledDate(invoice?.scheduledDate ?? null);
    setMode(invoice?.mode ?? "new");
    setDraftId(invoice?.draftId ?? null);
    setSubmitError(null);
    if (invoice?.contactId) {
      loadDraftsForCustomer(invoice.contactId);
    } else {
      draftsFetchIdRef.current++;
      setIsLoadingDrafts(false);
      setCustomerDrafts([]);
    }
  }

  function currentInvoice(): HungInvoice {
    return { cart, contactId: selectedContactId, scheduledDate, mode, draftId, hungAt: Date.now() };
  }

  function hangInvoice() {
    onHungInvoiceChange(currentInvoice());
    loadIntoForm(null);
    setHungConfirm(null);
  }

  function resumeHungInvoice() {
    if (!hungInvoice) return;
    onHungInvoiceChange(hasWork ? currentInvoice() : null);
    loadIntoForm(hungInvoice);
  }

  const hungSummary = useMemo(() => {
    if (!hungInvoice) return null;
    const contact = contacts.find((c) => c.contact_id === hungInvoice.contactId);
    const lines = Object.values(hungInvoice.cart);
    return {
      name: contact ? contact.company_name || contact.contact_name : hungInvoice.contactId ? "Customer" : "No customer yet",
      itemCount: lines.length,
      total: lines.reduce((sum, line) => sum + line.rate * line.quantity, 0),
    };
  }, [hungInvoice, contacts]);
  const canSubmit =
    !!selectedContactId && lineItems.length > 0 && !isSubmitting && !isLoadingItems && (mode === "new" || !!draftId);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Invoice</h1>
        <div className="page-header__actions">
          <button
            type="button"
            className="btn btn--secondary hang-button"
            disabled={!hasWork || isLoadingItems || isSubmitting}
            onClick={() => (hungInvoice ? setHungConfirm("replace") : hangInvoice())}
            title="Put this invoice aside to finish later"
          >
            <Pause size={14} /> Hang
          </button>
        </div>
      </div>

      {hungInvoice && hungSummary && (
        <div className="hung-invoice" role="status">
          <div className="hung-invoice__text">
            <div className="hung-invoice__title">Hung invoice waiting{hungInvoice.mode === "update" ? " (draft update)" : ""}</div>
            <div className="hung-invoice__detail">
              {hungSummary.name} · {hungSummary.itemCount} {hungSummary.itemCount === 1 ? "item" : "items"} · {currency(hungSummary.total)}
            </div>
          </div>
          <div className="hung-invoice__actions">
            <button
              type="button"
              className="btn hung-invoice__resume"
              disabled={isLoadingItems || isSubmitting}
              onClick={resumeHungInvoice}
              title={hasWork ? "Resume it — the invoice on screen is hung in its place" : "Resume it"}
            >
              <Play size={14} /> Resume
            </button>
            <button
              type="button"
              className="hung-invoice__remove"
              aria-label="Remove hung invoice"
              title="Remove hung invoice"
              onClick={() => setHungConfirm("remove")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle__option${mode === "new" ? " mode-toggle__option--active" : ""}`}
          onClick={() => selectMode("new")}
        >
          Create New Invoice
        </button>
        <button
          type="button"
          className={`mode-toggle__option${mode === "update" ? " mode-toggle__option--active" : ""}`}
          onClick={() => selectMode("update")}
        >
          Update Draft
        </button>
      </div>

      <CustomerCombobox
        contacts={contacts}
        selectedContactId={selectedContactId}
        onSelect={selectContact}
      />

      {mode === "new" && selectedContactId && !isLoadingDrafts && customerDrafts.length > 0 && (
        <div className="draft-hint">
          <Info size={14} className="draft-hint__icon" />
          This customer already has {customerDrafts.length === 1 ? "a draft" : `${customerDrafts.length} drafts`}.
        </div>
      )}

      {mode === "update" && selectedContactId && (
        <DraftPicker
          drafts={customerDrafts}
          selectedDraftId={draftId}
          isLoading={isLoadingDrafts}
          onSelect={selectDraft}
        />
      )}

      <SchedulePicker value={scheduledDate} onChange={setScheduledDate} />

      <button
        type="button"
        className="btn btn--dashed btn--full"
        onClick={() => setIsAddItemOpen(true)}
        disabled={isLoadingItems}
      >
        + Add Item
      </button>

      <div className="items-area">
        {isLoadingItems ? (
          <div className="items-area__empty">Loading items…</div>
        ) : (
          <InvoiceLineItemsList
            lineItems={lineItems}
            total={invoiceTotal}
            onRemove={removeItem}
            onSelect={openItemInModal}
          />
        )}
      </div>

      <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={notifyTelegram}
          onChange={(e) => setNotifyTelegram(e.target.checked)}
        />
        <span className="field-label" style={{ margin: 0 }}>
          Send to Telegram channel
        </span>
      </label>

      {submitError && <div className="form-error">{submitError}</div>}

      <button type="button" className="btn btn--primary btn--full" disabled={!canSubmit} onClick={submitInvoice}>
        {isSubmitting
          ? "Submitting..."
          : notifyTelegram
            ? mode === "update"
              ? "Update Draft"
              : "Submit Invoice"
            : mode === "update"
              ? "Update Draft (no Telegram)"
              : "Submit Invoice (no Telegram)"}
      </button>

      <AddItemModal
        open={isAddItemOpen}
        cart={cart}
        initialItemId={itemToOpen}
        onClose={() => {
          setIsAddItemOpen(false);
          setItemToOpen(null);
        }}
        onCommitItem={commitItem}
        onRemoveItem={removeItem}
        onItemsRefreshed={setCatalogItems}
      />

      {hungConfirm === "replace" && (
        <ConfirmModal
          title="Replace hung invoice?"
          message={`There's already a hung invoice (${hungSummary?.name ?? "invoice"}). Hanging this one throws that one away.`}
          confirmLabel="Replace"
          onConfirm={hangInvoice}
          onCancel={() => setHungConfirm(null)}
        />
      )}
      {hungConfirm === "remove" && (
        <ConfirmModal
          title="Remove hung invoice?"
          message={`The hung invoice (${hungSummary?.name ?? "invoice"}) will be thrown away. This can't be undone.`}
          confirmLabel="Remove"
          onConfirm={() => {
            onHungInvoiceChange(null);
            setHungConfirm(null);
          }}
          onCancel={() => setHungConfirm(null)}
        />
      )}
    </div>
  );
}
