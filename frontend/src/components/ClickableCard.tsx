import type { ReactNode } from "react";

type Props = {
  onClick: () => void;
  className?: string;
  children: ReactNode;
};

/**
 * Generic clickable/keyboard-activatable card row (Enter/Space trigger the
 * same action as a click). Underlies the draft, customer, and invoice list
 * cards — each page supplies its own inner layout via `children`.
 */
export default function ClickableCard({ onClick, className, children }: Props) {
  return (
    <div
      className={`draft-card draft-card--clickable${className ? ` ${className}` : ""}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}
