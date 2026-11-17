import { Truck } from "lucide-react";
import type { LoadingSummary } from "../types";
import { reportTime } from "../lib/shortages";

/**
 * A truck icon, no text, once every item of the order was confirmed loaded
 * on the Items tab: green when all of it was received, amber when some items
 * weren't. Its tooltip says which, and when.
 */
export default function ShippedBadge({ loading }: { loading: LoadingSummary }) {
  const short = loading.short_items > 0;
  const label = `${short ? `Shipped, ${loading.short_items} item(s) not all received` : "Shipped"} · ${reportTime(loading.at)}`;
  return (
    <span className={`shipped-badge${short ? " shipped-badge--short" : ""}`} title={label} aria-label={label} role="img">
      <Truck size={14} />
    </span>
  );
}
