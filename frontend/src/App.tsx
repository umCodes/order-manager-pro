import { useState } from "react";
import "./App.css";
import TabBar from "./components/TabBar";
import NewInvoicePage from "./pages/NewInvoicePage";
import MessagesPage from "./pages/MessagesPage";
import DraftsPage from "./pages/DraftsPage";
import InvoiceDetailsPage from "./pages/InvoiceDetailsPage";
import CustomerDetailsPage from "./pages/CustomerDetailsPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import type { Cart, ScheduledDate, TabKey } from "./types";

/**
 * Root component and router. There's no URL-based routing — navigation is
 * plain state: selecting an invoice or customer pushes a "detail view" over
 * the tabbed pages, and going back clears it. Only one detail view can be
 * open at a time.
 */
function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("invoices");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [invoiceContactId, setInvoiceContactId] = useState<string>("");
  const [invoiceScheduledDate, setInvoiceScheduledDate] = useState<ScheduledDate>(null);

  if (selectedInvoiceId) {
    return (
      <div className="app-frame">
        <div className="app-frame__body">
          <InvoiceDetailsPage
            invoiceId={selectedInvoiceId}
            onBack={() => setSelectedInvoiceId(null)}
          />
        </div>
      </div>
    );
  }

  if (selectedCustomerId) {
    return (
      <div className="app-frame">
        <div className="app-frame__body">
          <CustomerDetailsPage
            customerId={selectedCustomerId}
            onBack={() => setSelectedCustomerId(null)}
            onSelectInvoice={setSelectedInvoiceId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <div className="app-frame__body">
        {activeTab === "invoices" && (
          <NewInvoicePage
            cart={cart}
            onCartChange={setCart}
            selectedContactId={invoiceContactId}
            onSelectedContactIdChange={setInvoiceContactId}
            scheduledDate={invoiceScheduledDate}
            onScheduledDateChange={setInvoiceScheduledDate}
          />
        )}
        {activeTab === "messages" && <MessagesPage />}
        {activeTab === "drafts" && <DraftsPage onSelectInvoice={setSelectedInvoiceId} />}
        {activeTab === "items" && <ItemsPage />}
        {activeTab === "customers" && <CustomersPage onSelectCustomer={setSelectedCustomerId} />}
      </div>
      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

export default App;