import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { fetchCustomers } from "./lib/api";
import CustomerListView from "./components/CustomerListView";
import CustomerForm from "./components/CustomerForm";
import type { Contact } from "./types";

type Selection = { type: "new" } | { type: "edit"; customer: Contact } | null;

/**
 * Root component. Single-purpose app: search/list customers, then add or
 * edit one. No invoices, items, or messages — just the customer record.
 *
 * Desktop shows the list and the form side by side (master-detail); mobile
 * shows one at a time and the form becomes a full page with a back button.
 * Both panes are always mounted — CSS alone decides what's visible at a
 * given width — so switching between them never re-fetches or flashes.
 */
function App() {
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  const loadCustomers = useCallback(() => {
    return fetchCustomers()
      .then((list) => {
        setCustomers(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load customers"))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  function handleSaved(customer: Contact) {
    setCustomers((prev) => {
      const index = prev.findIndex((c) => c.contact_id === customer.contact_id);
      if (index === -1) return [...prev, customer];
      const next = [...prev];
      next[index] = customer;
      return next;
    });
    setSelection({ type: "edit", customer });
  }

  const selectedCustomerId = selection?.type === "edit" ? selection.customer.contact_id : undefined;

  return (
    <div className="app-frame">
      <div className="app-frame__body">
        <div className={`workspace${selection ? " workspace--detail-active" : ""}`}>
          <div className="workspace__list">
            <CustomerListView
              customers={customers}
              isLoading={isLoading}
              error={error}
              selectedCustomerId={selectedCustomerId}
              onSelect={(customer) => setSelection({ type: "edit", customer })}
              onAddNew={() => setSelection({ type: "new" })}
            />
          </div>
          <div className="workspace__detail">
            {selection ? (
              <CustomerForm
                key={selection.type === "edit" ? selection.customer.contact_id : "new"}
                customer={selection.type === "edit" ? selection.customer : null}
                customers={customers}
                onBack={() => setSelection(null)}
                onSaved={handleSaved}
              />
            ) : (
              <div className="detail-empty">
                <div className="detail-empty__title">No customer selected</div>
                <div className="detail-empty__subtitle">
                  Pick a customer from the list to edit their info, or add a new one.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
