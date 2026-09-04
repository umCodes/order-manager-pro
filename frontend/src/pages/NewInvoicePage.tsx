import { useEffect, useMemo, useRef, useState } from "react";
import AddItemModal from "../components/AddItemModal";
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
  fetchZohoUsage,
} from "../lib/api";
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
};

/**
 * Invoice-creation form: pick a customer, an optional scheduled date, and
 * line items. A top toggle switches between "Create New Invoice" (always
 * posts a brand-new invoice, cart starts empty) and "Update Draft" (a second
 * dropdown lets you pick which of the customer's existing drafts, by invoice
 * number, to load and update).
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
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [itemToOpen, setItemToOpen] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [zohoRequestCount, setZohoRequestCount] = useState<number | null>(null);
  const [customerDrafts, setCustomerDrafts] = useState<DraftInvoice[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [isLoadingDraftItems, setIsLoadingDraftItems] = useState(false);
  const draftsFetchIdRef = useRef(0);
  const draftItemsFetchIdRef = useRef(0);

  useEffect(() => {
    fetchCustomers().then(setContacts);
    fetchItems().then(setCatalogItems);
    fetchZohoUsage().then((usage) => setZohoRequestCount(usage.count)).catch(() => {});
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
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit invoice");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLoadingItems = isLoadingDraftItems;
  const canSubmit =
    !!selectedContactId && lineItems.length > 0 && !isSubmitting && !isLoadingItems && (mode === "new" || !!draftId);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Invoice</h1>
        {zohoRequestCount !== null && (
          <span className="badge" title="Zoho API requests used today">
            {zohoRequestCount} Zoho req{zohoRequestCount === 1 ? "" : "s"} today
          </span>
        )}
      </div>

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

      {submitError && <div className="form-error">{submitError}</div>}

      <button type="button" className="btn btn--primary btn--full" disabled={!canSubmit} onClick={submitInvoice}>
        {isSubmitting ? "Submitting..." : mode === "update" ? "Update Draft" : "Submit Invoice"}
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
      />
    </div>
  );
}
