import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Pause, Play, Send, Trash2 } from "lucide-react";
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
  sendItemsListToTelegram,
} from "../lib/api";
import { currency } from "../lib/currency";
import type { HeldInvoice } from "../lib/heldInvoice";
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
      ...(item.unit ? { unit: item.unit } : {}),
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
  /** The invoice put on hold with "Hold", if any (a single slot). */
  heldInvoice: HeldInvoice | null;
  onHeldInvoiceChange: (invoice: HeldInvoice | null) => void;
};

/**
 * Invoice-creation form: pick a customer, an optional scheduled date, and
 * line items. A top toggle switches between "Create New Invoice" (always
 * posts a brand-new invoice, cart starts empty) and "Update Draft" (a second
 * dropdown lets you pick which of the customer's existing drafts, by invoice
 * number, to load and update). A third mode, "Items Only", sends just the
 * item list to Telegram with no customer and no invoice in Zoho — its own
 * mode (and look) so an invoice without a customer is never made by mistake.
 *
 * "Hold" puts the whole form (either mode) aside into a single slot and
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
  heldInvoice,
  onHeldInvoiceChange,
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
  const [itemsSentNotice, setItemsSentNotice] = useState(false);
  const [heldConfirm, setHeldConfirm] = useState<"replace" | "remove" | null>(null);
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
        ...line,
        unit: line.unit || catalogItem?.unit || "",
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
    setSubmitError(null);
    setItemsSentNotice(false);
    onCartChange(keepManualLines(cart));
    // Items Only has no customer: drop it rather than keep one hidden.
    if (nextMode === "items") {
      setSelectedContactId("");
      draftsFetchIdRef.current++;
      setIsLoadingDrafts(false);
      setCustomerDrafts([]);
    }
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
    values: { description: string; quantity: string; rate: string; excludeFromTelegram: boolean; unit?: string },
  ) {
    onCartChange({
      ...cart,
      [itemId]: {
        description: values.description,
        quantity: Number(values.quantity) || 0,
        rate: Number(values.rate) || 0,
        excludeFromTelegram: values.excludeFromTelegram,
        ...(values.unit ? { unit: values.unit } : {}),
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

  function toLinePayload(li: InvoiceLineItem) {
    return {
      item_id: li.item_id,
      description: li.excludeFromTelegram ? `${li.description} ###` : li.description,
      quantity: li.quantity,
      rate: li.rate,
      unit: li.unit,
    };
  }

  /** Items Only: posts the list to Telegram, creates nothing in Zoho, then goes back to Create New Invoice. */
  async function sendItemsOnly() {
    if (mode !== "items" || lineItems.length === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await sendItemsListToTelegram({
        ...(scheduledDate ? { date: scheduledDate } : {}),
        line_items: lineItems.map(toLinePayload),
      });
      onCartChange({});
      setScheduledDate(null);
      setMode("new");
      setItemsSentNotice(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to send items list");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitInvoice() {
    if (mode === "items") return sendItemsOnly();
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
        line_items: lineItems.map(toLinePayload),
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
  function loadIntoForm(invoice: Omit<HeldInvoice, "heldAt"> | null) {
    draftItemsFetchIdRef.current++;
    setIsLoadingDraftItems(false);
    onCartChange(invoice?.cart ?? {});
    setSelectedContactId(invoice?.contactId ?? "");
    setScheduledDate(invoice?.scheduledDate ?? null);
    setMode(invoice?.mode ?? "new");
    setDraftId(invoice?.draftId ?? null);
    setSubmitError(null);
    setItemsSentNotice(false);
    if (invoice?.contactId) {
      loadDraftsForCustomer(invoice.contactId);
    } else {
      draftsFetchIdRef.current++;
      setIsLoadingDrafts(false);
      setCustomerDrafts([]);
    }
  }

  function currentInvoice(): HeldInvoice {
    return { cart, contactId: selectedContactId, scheduledDate, mode, draftId, heldAt: Date.now() };
  }

  function holdInvoice() {
    onHeldInvoiceChange(currentInvoice());
    loadIntoForm(null);
    setHeldConfirm(null);
  }

  function resumeHeldInvoice() {
    if (!heldInvoice) return;
    onHeldInvoiceChange(hasWork ? currentInvoice() : null);
    loadIntoForm(heldInvoice);
  }

  const heldSummary = useMemo(() => {
    if (!heldInvoice) return null;
    const contact = contacts.find((c) => c.contact_id === heldInvoice.contactId);
    const lines = Object.values(heldInvoice.cart);
    return {
      name:
        heldInvoice.mode === "items"
          ? "No customer"
          : contact
            ? contact.company_name || contact.contact_name
            : heldInvoice.contactId
              ? "Customer"
              : "No customer yet",
      itemCount: lines.length,
      total: lines.reduce((sum, line) => sum + line.rate * line.quantity, 0),
    };
  }, [heldInvoice, contacts]);
  const canSubmit =
    lineItems.length > 0 &&
    !isSubmitting &&
    !isLoadingItems &&
    (mode === "items" || (!!selectedContactId && (mode === "new" || !!draftId)));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{mode === "items" ? "Items List" : "New Invoice"}</h1>
        <div className="page-header__actions">
          <button
            type="button"
            className="btn btn--secondary hold-button"
            disabled={!hasWork || isLoadingItems || isSubmitting}
            onClick={() => (heldInvoice ? setHeldConfirm("replace") : holdInvoice())}
            title="Put this invoice aside to finish later"
          >
            <Pause size={14} /> Hold
          </button>
        </div>
      </div>

      {heldInvoice && heldSummary && (
        <div className="held-invoice" role="status">
          <div className="held-invoice__text">
            <div className="held-invoice__title">{heldInvoice.mode === "items" ? "Items list on hold" : `Invoice on hold${heldInvoice.mode === "update" ? " (draft update)" : ""}`}</div>
            <div className="held-invoice__detail">
              {heldSummary.name} · {heldSummary.itemCount} {heldSummary.itemCount === 1 ? "item" : "items"} · {currency(heldSummary.total)}
            </div>
          </div>
          <div className="held-invoice__actions">
            <button
              type="button"
              className="btn held-invoice__resume"
              disabled={isLoadingItems || isSubmitting}
              onClick={resumeHeldInvoice}
              title={hasWork ? "Resume it — the invoice on screen goes on hold in its place" : "Resume it"}
            >
              <Play size={14} /> Resume
            </button>
            <button
              type="button"
              className="held-invoice__remove"
              aria-label="Remove held invoice"
              title="Remove held invoice"
              onClick={() => setHeldConfirm("remove")}
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
          New Invoice
        </button>
        <button
          type="button"
          className={`mode-toggle__option${mode === "update" ? " mode-toggle__option--active" : ""}`}
          onClick={() => selectMode("update")}
        >
          Update Draft
        </button>
        <button
          type="button"
          className={`mode-toggle__option mode-toggle__option--items${mode === "items" ? " mode-toggle__option--active" : ""}`}
          onClick={() => selectMode("items")}
        >
          Items Only
        </button>
      </div>

      {mode === "items" ? (
        <div className="items-only-notice">
          <Send size={15} className="items-only-notice__icon" />
          <div>
            <strong>No invoice will be created.</strong> Only this list of items is sent to the Telegram channel — no
            customer, nothing saved in Zoho.
          </div>
        </div>
      ) : (
        <CustomerCombobox contacts={contacts} selectedContactId={selectedContactId} onSelect={selectContact} />
      )}

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

      {mode !== "items" && (
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
      )}

      {submitError && <div className="form-error">{submitError}</div>}

      {itemsSentNotice && mode === "new" && lineItems.length === 0 && (
        <div className="items-sent-notice" role="status">Items list sent to Telegram. No invoice was created.</div>
      )}

      <button
        type="button"
        className={`btn btn--primary btn--full${mode === "items" ? " btn--items-only" : ""}`}
        disabled={!canSubmit}
        onClick={submitInvoice}
      >
        {isSubmitting
          ? mode === "items"
            ? "Sending..."
            : "Submitting..."
          : mode === "items"
            ? "Send Items to Telegram"
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

      {heldConfirm === "replace" && (
        <ConfirmModal
          title="Replace held invoice?"
          message={`There's already a held invoice (${heldSummary?.name ?? "invoice"}). Holding this one throws that one away.`}
          confirmLabel="Replace"
          onConfirm={holdInvoice}
          onCancel={() => setHeldConfirm(null)}
        />
      )}
      {heldConfirm === "remove" && (
        <ConfirmModal
          title="Remove held invoice?"
          message={`The held invoice (${heldSummary?.name ?? "invoice"}) will be thrown away. This can't be undone.`}
          confirmLabel="Remove"
          onConfirm={() => {
            onHeldInvoiceChange(null);
            setHeldConfirm(null);
          }}
          onCancel={() => setHeldConfirm(null)}
        />
      )}
    </div>
  );
}
