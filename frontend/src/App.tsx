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
import type { Cart, InvoiceMode, ScheduledDate, TabKey } from "./types";

/**
 * Root component and router. There's no URL-based routing — navigation is
 * plain state: selecting an invoice or customer opens a detail view as an
 * overlay on top of the tabbed pages. The tab content stays mounted
 * underneath rather than being replaced, so a list's scroll position, search
 * text, and filters are all still there when the overlay closes — going
 * back doesn't reset the list to the top. Both overlays can be open at once
 * (e.g. opening an invoice from within a customer's detail view), stacked by
 * z-index with the invoice on top.
 */
function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("invoices");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [invoiceContactId, setInvoiceContactId] = useState<string>("");
  const [invoiceScheduledDate, setInvoiceScheduledDate] = useState<ScheduledDate>(null);
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("new");
  const [invoiceDraftId, setInvoiceDraftId] = useState<string | null>(null);

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
            mode={invoiceMode}
            onModeChange={setInvoiceMode}
            draftId={invoiceDraftId}
            onDraftIdChange={setInvoiceDraftId}
          />
        )}
        {activeTab === "messages" && <MessagesPage />}
        {activeTab === "drafts" && <DraftsPage onSelectInvoice={setSelectedInvoiceId} />}
        {activeTab === "items" && <ItemsPage />}
        {activeTab === "customers" && <CustomersPage onSelectCustomer={setSelectedCustomerId} />}
      </div>
      <TabBar active={activeTab} onChange={setActiveTab} />

      {selectedCustomerId && (
        <div className="detail-overlay">
          <div className="app-frame__body">
            <CustomerDetailsPage
              customerId={selectedCustomerId}
              onBack={() => setSelectedCustomerId(null)}
              onSelectInvoice={setSelectedInvoiceId}
            />
          </div>
        </div>
      )}

      {selectedInvoiceId && (
        <div className="detail-overlay detail-overlay--invoice">
          <div className="app-frame__body">
            <InvoiceDetailsPage
              invoiceId={selectedInvoiceId}
              onBack={() => setSelectedInvoiceId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;