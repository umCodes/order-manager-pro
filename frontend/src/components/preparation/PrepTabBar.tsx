import { ClipboardCheck, Package, Truck } from "lucide-react";

export type PrepTab = "prepare" | "ship" | "items";

const TABS: { key: PrepTab; label: string; icon: typeof Truck }[] = [
  { key: "prepare", label: "Prepare", icon: ClipboardCheck },
  { key: "ship", label: "Ship", icon: Truck },
  { key: "items", label: "Items", icon: Package },
];

/** Bottom navigation for the preparation app, styled like the office app's tab bar. */
export default function PrepTabBar({ active, onChange }: { active: PrepTab; onChange: (tab: PrepTab) => void }) {
  return (
    <nav className="tab-bar tab-bar--prep">
      {TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`tab-bar__item${key === active ? " tab-bar__item--active" : ""}`}
          aria-current={key === active ? "page" : undefined}
          onClick={() => onChange(key)}
        >
          <span className="tab-bar__icon">
            <Icon size={23} />
          </span>
          <span className="tab-bar__label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
