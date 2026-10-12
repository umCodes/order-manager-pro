import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { fetchZohoUsage } from "../lib/api";

/**
 * Today's Zoho API request count, compact for the app header: a gauge icon
 * and the number. Refetched whenever `refreshKey` changes (the active tab),
 * so it stays roughly current without polling. Hidden until it has loaded.
 */
export default function ZohoUsageBadge({ refreshKey }: { refreshKey: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetchZohoUsage()
      .then((usage) => setCount(usage.count))
      .catch(() => {});
  }, [refreshKey]);

  if (count === null) return null;
  return (
    <span className="app-header__usage" title="Zoho API requests used today" aria-label={`${count} Zoho API requests used today`}>
      <Gauge size={14} aria-hidden />
      {count}
    </span>
  );
}
