import { Truck } from "lucide-react";
import type { LoadingSummary } from "../types";
import { reportTime } from "../lib/shortages";

/**
 * Green "🚚 Shipped" once every item of the order was confirmed loaded on the
 * Items tab; amber, with how many items weren't all received, when some
 * weren't. With `showTime`, when the last item was confirmed.
 */
export default function ShippedBadge({ loading, showTime }: { loading: LoadingSummary; showTime?: boolean }) {
  const short = loading.short_items > 0;
  return (
    <span
      className={`shipped-badge${short ? " shipped-badge--short" : ""}`}
      title={short ? `Shipped, ${loading.short_items} item(s) not all received` : "Shipped: every item loaded"}
    >
      <Truck size={12} />
      Shipped{short && ` · ${loading.short_items} short`}
      {showTime && <span className="shipped-badge__at">{reportTime(loading.at)}</span>}
    </span>
  );
}
