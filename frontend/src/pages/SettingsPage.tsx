import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import CategoryOrderSettings from "../components/CategoryOrderSettings";
import DailyReportWhatsAppSettings from "../components/DailyReportWhatsAppSettings";
import InvoiceDueSettings from "../components/InvoiceDueSettings";
import GeneralItemsSettings from "../components/GeneralItemsSettings";
import GeneralItemsWhatsAppSettings from "../components/GeneralItemsWhatsAppSettings";
import NotificationTemplateSettings from "../components/NotificationTemplateSettings";

type Props = {
  onBack: () => void;
};

type SectionKey = "categories" | "general-items" | "invoices" | "notifications" | "daily-report";

/** The Settings menu, top to bottom: each entry opens a page of its own. */
const SECTIONS: { key: SectionKey; title: string; description: string; render: () => ReactNode }[] = [
  {
    key: "categories",
    title: "Item categories",
    description: "The order categories appear in, when adding items and on the Items tab",
    render: () => <CategoryOrderSettings />,
  },
  {
    key: "general-items",
    title: "General items",
    description: "Which items are general, and the WhatsApp notice sent when an invoice has them",
    render: () => (
      <>
        <GeneralItemsSettings />
        <GeneralItemsWhatsAppSettings />
      </>
    ),
  },
  {
    key: "invoices",
    title: "Invoices",
    description: "How long new invoices have before they're overdue",
    render: () => <InvoiceDueSettings />,
  },
  {
    key: "notifications",
    title: "Customer notifications",
    description: "The WhatsApp template for each customer message, by language",
    render: () => <NotificationTemplateSettings />,
  },
  {
    key: "daily-report",
    title: "Daily report",
    description: "The WhatsApp template and numbers the daily report goes to",
    render: () => <DailyReportWhatsAppSettings />,
  },
];

/**
 * App-wide settings, opened from the gear in the header: a menu of
 * sections, each opening a page of its own (back returns to the menu).
 */
export default function SettingsPage({ onBack }: Props) {
  const [openKey, setOpenKey] = useState<SectionKey | null>(null);
  const open = SECTIONS.find((section) => section.key === openKey);

  return (
    <div>
      <div className="page-header">
        <button
          type="button"
          className="icon-btn"
          onClick={open ? () => setOpenKey(null) : onBack}
          aria-label={open ? "Back to Settings" : "Back"}
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <h1 className="page-title" style={{ marginTop: 12 }}>
        {open ? open.title : "Settings"}
      </h1>

      {open ? (
        <div key={open.key} className="settings-section-page">
          {open.render()}
        </div>
      ) : (
        <div className="settings-menu">
          {SECTIONS.map((section) => (
            <button key={section.key} type="button" className="settings-menu__row" onClick={() => setOpenKey(section.key)}>
              <span className="settings-menu__text">
                <span className="settings-menu__title">{section.title}</span>
                <span className="settings-menu__description">{section.description}</span>
              </span>
              <ChevronRight size={18} className="settings-menu__chevron" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
