import { ArrowDown, Check, Circle, Minus, TriangleAlert, X } from "lucide-react";
import { formatWeight, lineStatus, toKilos, type LineStatus } from "../lib/prep";
import type { PrepLineItem, PrepStep } from "../types";

/**
 * One icon per line status, used everywhere on the preparers' / drivers'
 * screen in place of words — the legend at the top names each one once, so
 * the cards stay uncluttered.
 */
const ICONS: Record<LineStatus, typeof Check> = {
  todo: Circle,
  waiting: Minus,
  full: Check,
  short: ArrowDown,
  none: X,
  conflict: TriangleAlert,
};

const LABELS: Record<LineStatus, string> = {
  todo: "ገና",
  waiting: "",
  full: "ሙሉ",
  short: "ጎድሏል",
  none: "የለም",
  conflict: "ልዩነት",
};

/** "Waiting" names the step it waits on: not prepared yet / not sent yet. */
const WAITING_LABEL: Record<PrepStep, string> = { prepared: "", sent: "ያልተዘጋጀ", received: "ያልወጣ" };

export function StatusIcon({ status, size = 16 }: { status: LineStatus; size?: number }) {
  const Icon = ICONS[status];
  return <Icon size={size} strokeWidth={3} className={`prep-icon prep-icon--${status}`} aria-label={LABELS[status]} />;
}

/** A line's badge at a step: just the icon, plus the amount when it's short or in conflict. */
export function StepBadge({ line, step }: { line: PrepLineItem; step: PrepStep }) {
  const status = lineStatus(line, step);
  const amount = status === "short" ? line[step] : status === "conflict" ? line.received : null;
  return (
    <span className={`prep-badge prep-badge--${status}`}>
      <StatusIcon status={status} size={status === "todo" || status === "waiting" ? 14 : 18} />
      {amount !== null && formatWeight(toKilos(amount, line.unit))}
    </span>
  );
}

/** The one place the icons are spelled out, for the statuses this step can show. */
export function StatusLegend({ step }: { step: PrepStep }) {
  const statuses: LineStatus[] =
    step === "prepared" ? ["todo", "full", "short", "none"] : ["waiting", "todo", "full", "short", "conflict"];
  return (
    <div className="prep-legend">
      {statuses.map((status) => (
        <span key={status} className="prep-legend__entry">
          <span className={`prep-badge prep-badge--${status} prep-badge--legend`}>
            <StatusIcon status={status} size={status === "todo" || status === "waiting" ? 11 : 14} />
          </span>
          {status === "waiting" ? WAITING_LABEL[step] : LABELS[status]}
        </span>
      ))}
    </div>
  );
}
