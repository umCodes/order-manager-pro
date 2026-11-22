import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import "./App.css";
import TabBar from "./components/TabBar";
import { startUnreadWatcher } from "./lib/unread";
import { startVisitsWatcher } from "./lib/visits";
import NewInvoicePage from "./pages/NewInvoicePage";
import MessagesPage from "./pages/MessagesPage";
import DraftsPage from "./pages/DraftsPage";
import InvoiceDetailsPage from "./pages/InvoiceDetailsPage";
import CustomerDetailsPage from "./pages/CustomerDetailsPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import SettingsPage from "./pages/SettingsPage";
import ZohoUsageBadge from "./components/ZohoUsageBadge";
import Layer from "./components/Layer";
import { backHandlerFor, useHistoryLayers, type HistoryLayer } from "./lib/native/history";
import { closeTopWindow, useOpenWindow } from "./lib/native/sheets";
import { haptic } from "./lib/native/haptics";
import { loadHeldInvoice, saveHeldInvoice, type HeldInvoice } from "./lib/heldInvoice";
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
 *
 * It behaves like a native app: each overlay is a Layer that slides in and
 * out (and on iPhone follows a swipe from the left edge), the tabs sit back
 * under it, and every open layer or window is a browser history entry, so
 * the phone's back button closes the top one instead of leaving the app.
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
  const [heldInvoice, setHeldInvoice] = useState<HeldInvoice | null>(loadHeldInvoice);

  function changeHeldInvoice(invoice: HeldInvoice | null) {
    setHeldInvoice(invoice);
    saveHeldInvoice(invoice);
  }

  const isWindowOpen = useOpenWindow();

  // Each tab keeps its own scroll position, like a native tab bar.
  const scrollByTab = useRef<Partial<Record<TabKey, number>>>({});
  function changeTab(tab: TabKey) {
    if (tab === activeTab) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    scrollByTab.current[activeTab] = window.scrollY;
    haptic("light");
    setActiveTab(tab);
  }
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByTab.current[activeTab] ?? 0);
  }, [activeTab]);

  const closeCustomer = () => {
    setSelectedCustomerId(null);
    setIsCustomerOnTop(false);
  };
  const closeInvoice = () => setSelectedInvoiceId(null);

  // Open layers, bottom first, for the back button (see lib/native/history).
  const customerLayer: HistoryLayer | null = selectedCustomerId ? { key: `customer:${selectedCustomerId}`, onBack: closeCustomer } : null;
  const invoiceLayer: HistoryLayer | null = selectedInvoiceId
    ? { key: `invoice:${selectedInvoiceId}`, onBack: () => (backHandlerFor("invoice") ?? closeInvoice)() }
    : null;
  const layers = [
    ...(isCustomerOnTop ? [invoiceLayer, customerLayer] : [customerLayer, invoiceLayer]),
    isSettingsOpen ? { key: "settings", onBack: () => setIsSettingsOpen(false) } : null,
    isWindowOpen ? { key: "window", onBack: () => closeTopWindow() } : null,
  ].filter((layer): layer is HistoryLayer => !!layer);
  useHistoryLayers(layers);

  // What's on top of each screen, so the ones under it sit back.
  const screenOrder = [
    ...(isCustomerOnTop ? ["invoice", "customer"] : ["customer", "invoice"]).filter((key) =>
      key === "customer" ? !!selectedCustomerId : !!selectedInvoiceId,
    ),
    ...(isSettingsOpen ? ["settings"] : []),
  ];
  const isCovered = (key: string) => screenOrder.indexOf(key) >= 0 && screenOrder.indexOf(key) < screenOrder.length - 1;

  useEffect(() => startUnreadWatcher(), []);
  useEffect(() => startVisitsWatcher(), []);

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
    <div className={`app-frame${screenOrder.length ? " app-frame--covered" : ""}`}>
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
      <div className="app-frame__body" key={activeTab}>
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
            heldInvoice={heldInvoice}
            onHeldInvoiceChange={changeHeldInvoice}
          />
        )}
        {activeTab === "messages" && <MessagesPage />}
        {activeTab === "drafts" && <DraftsPage onSelectInvoice={setSelectedInvoiceId} />}
        {activeTab === "items" && <ItemsPage />}
        {activeTab === "customers" && <CustomersPage onSelectCustomer={openCustomerFromList} />}
      </div>
      <TabBar active={activeTab} onChange={changeTab} hasHeldInvoice={!!heldInvoice} />

      <Layer open={!!selectedCustomerId} level={isCustomerOnTop ? "top" : "customer"} covered={isCovered("customer")}>
        {selectedCustomerId && (
          <CustomerDetailsPage customerId={selectedCustomerId} onBack={closeCustomer} onSelectInvoice={openInvoiceFromCustomer} />
        )}
      </Layer>

      <Layer open={!!selectedInvoiceId} level="invoice" covered={isCovered("invoice")}>
        {selectedInvoiceId && (
          <InvoiceDetailsPage invoiceId={selectedInvoiceId} onBack={closeInvoice} onSelectCustomer={openCustomerFromInvoice} />
        )}
      </Layer>

      <Layer open={isSettingsOpen} level="settings">
        <SettingsPage onBack={() => setIsSettingsOpen(false)} />
      </Layer>
    </div>
  );
}

export default App;