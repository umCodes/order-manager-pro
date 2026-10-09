import { ArrowDown, Check, Circle, X } from "lucide-react";
import { formatAmount, lineStatus, type LineStatus } from "../../lib/preparation";
import type { PrepLineItem } from "../../types";

const ICONS: Record<LineStatus, typeof Check> = { todo: Circle, full: Check, short: ArrowDown, none: X };

/** Names each icon once, in the legend; everywhere else the icon stands alone. */
const LEGEND: Record<LineStatus, string> = { todo: "ገና", full: "ሙሉ", short: "ጎድሏል", none: "የለም" };

export function StatusIcon({ status, size = 16 }: { status: LineStatus; size?: number }) {
  const Icon = ICONS[status];
  return <Icon size={size} strokeWidth={3} aria-label={LEGEND[status]} />;
}

/**
 * What was prepared for one line, against what was ordered: ○ not yet,
 * ✓ all of it, ↓ plus the amount when only part was found, ✕ none found.
 */
export function LineBadge({ line }: { line: PrepLineItem }) {
  const status = lineStatus(line);
  return (
    <span className={`prp-badge prp-badge--${status}`}>
      <StatusIcon status={status} size={status === "todo" ? 14 : 18} />
      {status === "short" && line.prepared !== null && formatAmount(line.prepared, line.unit)}
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="prp-legend">
      {(Object.keys(LEGEND) as LineStatus[]).map((status) => (
        <span key={status} className="prp-legend__entry">
          <span className={`prp-badge prp-badge--${status} prp-badge--small`}>
            <StatusIcon status={status} size={status === "todo" ? 10 : 13} />
          </span>
          {LEGEND[status]}
        </span>
      ))}
    </div>
  );
}
