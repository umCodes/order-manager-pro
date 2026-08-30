/**
 * In-memory cache for GET-style fetches, shared across every component that
 * calls the same endpoint and kept for the lifetime of the page (a browser
 * reload clears it naturally since it's just a module-level Map). Callers
 * pass `force: true` (e.g. from a Refresh button) to bypass and refetch.
 */

const cache = new Map<string, Promise<unknown>>();

export function cachedFetch<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);

  if (existing) return existing as Promise<T>;

  const promise = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });


  cache.set(key, promise);
  return promise;
}

/** Drop a cached entry (or all of them) so the next call refetches. */
export function invalidateCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
