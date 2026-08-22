import { useState } from "react";
import { RefreshCw } from "lucide-react";

/** Icon button that triggers a forced (cache-bypassing) refetch for the page it sits on. */
export default function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleClick() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    onRefresh().finally(() => setIsRefreshing(false));
  }

  return (
    <button
      type="button"
      className="icon-btn refresh-button"
      onClick={handleClick}
      disabled={isRefreshing}
      aria-label="Refresh"
      title="Refresh"
    >
      <RefreshCw size={14} className={isRefreshing ? "refresh-button__icon--spinning" : undefined} />
    </button>
  );
}
