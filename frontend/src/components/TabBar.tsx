import { FileText, MessageSquare, FileClock, Package, Users } from "lucide-react";
import type { TabKey } from "../types";

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "invoices", label: "Invoice", icon: FileText },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "drafts", label: "Drafts", icon: FileClock },
  { key: "items", label: "Items", icon: Package },
  { key: "customers", label: "Customers", icon: Users },
];

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

/** Bottom navigation bar for switching between the app's top-level pages. */
export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tab-bar">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            className={`tab-bar__item${isActive ? " tab-bar__item--active" : ""}`}
            onClick={() => onChange(key)}
          >
            <Icon size={21} />
            <span className="tab-bar__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}