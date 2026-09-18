import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { fetchCustomers } from "./lib/api";
import CustomerListView from "./components/CustomerListView";
import CustomerForm from "./components/CustomerForm";
import type { Contact } from "./types";

type View = { name: "list" } | { name: "form"; customer: Contact | null };

/**
 * Root component. Single-purpose app: search/list customers, then add or
 * edit one. No invoices, items, or messages — just the customer record.
 */
function App() {
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "list" });

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
    setView({ name: "list" });
  }

  return (
    <div className="app-frame">
      <div className="app-frame__body">
        {view.name === "list" ? (
          <CustomerListView
            customers={customers}
            isLoading={isLoading}
            error={error}
            onSelect={(customer) => setView({ name: "form", customer })}
            onAddNew={() => setView({ name: "form", customer: null })}
          />
        ) : (
          <CustomerForm
            customer={view.customer}
            customers={customers}
            onBack={() => setView({ name: "list" })}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  );
}

export default App;
