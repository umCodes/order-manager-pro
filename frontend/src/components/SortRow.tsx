import type { ReactNode } from "react";
import type { SortDirection } from "../hooks/useSortState";

type Props<Key extends string> = {
  options: { key: Key; label: string }[];
  activeKey: Key;
  direction: SortDirection;
  onToggle: (key: Key) => void;
  /** Optional trailing text, e.g. a result count, shown right-aligned. */
  trailingText?: string;
  /** Optional trailing control (e.g. a filter dropdown), shown right-aligned. */
  trailing?: ReactNode;
};

/** Row of sort-toggle pills with an arrow indicating direction on the active one. */
export default function SortRow<Key extends string>({ options, activeKey, direction, onToggle, trailingText, trailing }: Props<Key>) {
  const hasTrailing = trailingText !== undefined || trailing !== undefined;
  return (
    <div className={`sort-row${hasTrailing ? " sort-row--with-count" : ""}`}>
      <div className={hasTrailing ? "sort-row__pills" : undefined}>
        {options.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`pill${activeKey === key ? " pill--active" : ""}`}
            onClick={() => onToggle(key)}
          >
            {label}
            {activeKey === key && (
              <span className="pill__sort-arrow">{direction === "asc" ? " ↑" : " ↓"}</span>
            )}
          </button>
        ))}
      </div>
      {trailingText !== undefined && <span className="sort-row__count">{trailingText}</span>}
      {trailing}
    </div>
  );
}
