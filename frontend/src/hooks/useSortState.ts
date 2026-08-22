import { useState } from "react";

export type SortDirection = "asc" | "desc";

/**
 * Tracks an active sort key + direction. Clicking the already-active key
 * flips direction; clicking a different key switches to it (ascending).
 */
export function useSortState<Key extends string>(initialKey: Key, initialDirection: SortDirection = "asc") {
  const [sortKey, setSortKey] = useState<Key>(initialKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

  function toggleSort(key: Key) {
    if (key === sortKey) {
      setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  return { sortKey, sortDirection, toggleSort };
}
