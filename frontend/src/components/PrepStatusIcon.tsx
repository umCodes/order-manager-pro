import { ArrowDown, Check, Circle, X } from "lucide-react";
import { formatWeight, lineKilos, lineStatus, type LineStatus } from "../lib/prep";
import type { PrepLineItem } from "../types";

/**
 * One icon per line status, used everywhere on the preparers' screen in
 * place of words — the legend at the top names each one once, so the cards
 * stay uncluttered.
 */
const STATUS: Record<LineStatus, { Icon: typeof Check; label: string }> = {
  todo: { Icon: Circle, label: "ገና" },
  full: { Icon: Check, label: "ሙሉ" },
  short: { Icon: ArrowDown, label: "ጎድሏል" },
  none: { Icon: X, label: "አልወጣም" },
};

export function StatusIcon({ status, size = 16 }: { status: LineStatus; size?: number }) {
  const { Icon, label } = STATUS[status];
  return <Icon size={size} strokeWidth={3} className={`prep-icon prep-icon--${status}`} aria-label={label} />;
}

/** A line's badge: just the icon, plus the amount that went out when it's short. */
export function ShippedBadge({ line }: { line: PrepLineItem }) {
  const status = lineStatus(line);
  return (
    <span className={`prep-badge prep-badge--${status}`}>
      <StatusIcon status={status} size={status === "todo" ? 14 : 18} />
      {status === "short" && formatWeight(lineKilos(line).shipped ?? 0)}
    </span>
  );
}

/** The one place the icons are spelled out. */
export function StatusLegend() {
  return (
    <div className="prep-legend">
      {(Object.keys(STATUS) as LineStatus[]).map((status) => (
        <span key={status} className="prep-legend__entry">
          <span className={`prep-badge prep-badge--${status} prep-badge--legend`}>
            <StatusIcon status={status} size={status === "todo" ? 11 : 14} />
          </span>
          {STATUS[status].label}
        </span>
      ))}
    </div>
  );
}
