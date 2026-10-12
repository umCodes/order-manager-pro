import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import "./App.css";
import TabBar from "./components/TabBar";
import { startUnreadWatcher } from "./lib/unread";
import NewInvoicePage from "./pages/NewInvoicePage";
import MessagesPage from "./pages/MessagesPage";
import DraftsPage from "./pages/DraftsPage";
import InvoiceDetailsPage from "./pages/InvoiceDetailsPage";
import CustomerDetailsPage from "./pages/CustomerDetailsPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import SettingsPage from "./pages/SettingsPage";
import ZohoUsageBadge from "./components/ZohoUsageBadge";
import type { Cart, InvoiceMode, ScheduledDate, TabKey } from "./types";

/**
 * Root component and router. There's no URL-based routing — navigation is
 * plain state: selecting an invoice or customer opens a detail view as an
 * overlay on top of the tabbed pages. The tab content stays mounted
 * underneath rather than being replaced, so a list's scroll position, search
 * text, and filters are all still there when the overlay closes — going
 * back doesn't reset the list to the top. Both overlays can be open at once,
 * stacked by z-index: normally the invoice is on top (opened from a
 * customer's detail view), but a customer opened from an invoice goes above
 * it, so going back from the customer returns to that invoice. Settings,
 * opened from the gear in the header, overlays everything.
 */
function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("invoices");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCustomerOnTop, setIsCustomerOnTop] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [invoiceContactId, setInvoiceContactId] = useState<string>("");
  const [invoiceScheduledDate, setInvoiceScheduledDate] = useState<ScheduledDate>(null);
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("new");
  const [invoiceDraftId, setInvoiceDraftId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => startUnreadWatcher(), []);

  function openCustomerFromList(customerId: string) {
    setIsCustomerOnTop(false);
    setSelectedCustomerId(customerId);
  }

  function openInvoiceFromCustomer(invoiceId: string) {
    setIsCustomerOnTop(false);
    setSelectedInvoiceId(invoiceId);
  }

  function openCustomerFromInvoice(customerId: string) {
    // Already came here from this customer's page: just go back to it.
    if (selectedCustomerId === customerId && !isCustomerOnTop) {
      setSelectedInvoiceId(null);
      return;
    }
    setSelectedCustomerId(customerId);
    setIsCustomerOnTop(true);
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <span className="app-header__title">Order Manager Pro</span>
        <div className="app-header__actions">
          <ZohoUsageBadge refreshKey={activeTab} />
          <button
            type="button"
            className="app-header__settings"
            aria-label="Settings"
            title="Settings"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
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
        {activeTab === "customers" && <CustomersPage onSelectCustomer={openCustomerFromList} />}
      </div>
      <TabBar active={activeTab} onChange={setActiveTab} />

      {selectedCustomerId && (
        <div className={`detail-overlay${isCustomerOnTop ? " detail-overlay--top" : ""}`}>
          <div className="app-frame__body">
            <CustomerDetailsPage
              customerId={selectedCustomerId}
              onBack={() => {
                setSelectedCustomerId(null);
                setIsCustomerOnTop(false);
              }}
              onSelectInvoice={openInvoiceFromCustomer}
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
              onSelectCustomer={openCustomerFromInvoice}
            />
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="detail-overlay detail-overlay--settings">
          <div className="app-frame__body">
            <SettingsPage onBack={() => setIsSettingsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;