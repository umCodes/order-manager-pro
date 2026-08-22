

const cache = new Map();


export function setTTLCache(key: string, value: any, expires_in: number){
    cache.set(key, value);
    setTimeout(() => cache.delete(key), expires_in * 1000)
}

export const getCache = (key: string) => cache.get(key)