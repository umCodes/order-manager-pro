import { useEffect, useMemo, useRef, useState } from "react";
import AddItemModal from "../components/AddItemModal";
import CustomerCombobox from "../components/CustomerCombobox";
import SchedulePicker from "../components/SchedulePicker";
import InvoiceLineItemsList from "../components/InvoiceLineItemsList";
import { createInvoice, fetchCustomerDraftToMergeInto, fetchCustomers, fetchItems, fetchZohoUsage } from "../lib/api";
import type { CatalogItem, Cart, Contact, InvoiceDetailLineItem, InvoiceLineItem, ScheduledDate } from "../types";

const EXCLUDE_MARKER = "###";

function cartFromDraftLineItems(lineItems: InvoiceDetailLineItem[]): Cart {
  const cart: Cart = {};
  for (const item of lineItems) {
    const excludeFromTelegram = item.description.includes(EXCLUDE_MARKER);
    cart[item.item_id] = {
      description: item.description.replace(new RegExp(EXCLUDE_MARKER, "g"), "").trim(),
      quantity: item.quantity,
      rate: item.rate,
      excludeFromTelegram,
    };
  }
  return cart;
}

type Props = {
  cart: Cart;
  onCartChange: (cart: Cart) => void;
};

/** Invoice-creation form: pick a customer, an optional scheduled date, and line items. */
export default function NewInvoicePage({ cart, onCartChange }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<ScheduledDate>(null);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [zohoRequestCount, setZohoRequestCount] = useState<number | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const draftFetchIdRef = useRef(0);

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

  function selectContact(contact: Contact) {
    setSelectedContactId(contact.contact_id);
    const fetchId = ++draftFetchIdRef.current;
    setIsLoadingDraft(true);
    fetchCustomerDraftToMergeInto(contact.contact_id)
      .then((draft) => {
        if (draftFetchIdRef.current !== fetchId) return;
        onCartChange(draft ? cartFromDraftLineItems(draft.line_items) : {});
      })
      .catch(() => {})
      .finally(() => {
        if (draftFetchIdRef.current === fetchId) setIsLoadingDraft(false);
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
      },
    });
  }

  function removeItem(itemId: string) {
    const next = { ...cart };
    delete next[itemId];
    onCartChange(next);
  }

  async function submitInvoice() {
    if (!selectedContactId || lineItems.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createInvoice({
        contact_id: selectedContactId,
        ...(scheduledDate ? { date: scheduledDate } : {}),
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
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit invoice");
    } finally {
      setIsSubmitting(false);
    }
  }

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

      <CustomerCombobox
        contacts={contacts}
        selectedContactId={selectedContactId}
        onSelect={selectContact}
      />

      <SchedulePicker value={scheduledDate} onChange={setScheduledDate} />

      <button
        type="button"
        className="btn btn--dashed btn--full"
        onClick={() => setIsAddItemOpen(true)}
        disabled={isLoadingDraft}
      >
        + Add Item
      </button>

      <div className="items-area">
        {isLoadingDraft ? (
          <div className="items-area__empty">Loading items…</div>
        ) : (
          <InvoiceLineItemsList lineItems={lineItems} total={invoiceTotal} onRemove={removeItem} />
        )}
      </div>

      {submitError && <div className="form-error">{submitError}</div>}

      <button
        type="button"
        className="btn btn--primary btn--full"
        disabled={!selectedContactId || lineItems.length === 0 || isSubmitting || isLoadingDraft}
        onClick={submitInvoice}
      >
        {isSubmitting ? "Submitting..." : "Submit Invoice"}
      </button>

      <AddItemModal
        open={isAddItemOpen}
        cart={cart}
        onClose={() => setIsAddItemOpen(false)}
        onCommitItem={commitItem}
        onRemoveItem={removeItem}
      />
    </div>
  );
}
