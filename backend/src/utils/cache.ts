

const cache = new Map();


/** Caches a value in process memory and forgets it after `expires_in` seconds. */
export function setTTLCache(key: string, value: any, expires_in: number){
    cache.set(key, value);
    setTimeout(() => cache.delete(key), expires_in * 1000)
}

/** Reads a cached value, or undefined if it was never set or has expired. */
export const getCache = (key: string) => cache.get(key)

/** Drops a cached value immediately — called after any write that invalidates it. */
export const deleteCache = (key: string) => cache.delete(key)