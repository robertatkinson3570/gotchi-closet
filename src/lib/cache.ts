type CacheEntry<T> = {
  v: number;
  ts: number;
  data: T;
};

const CACHE_VERSION = 1;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Stale-while-revalidate: returns cached data regardless of age (TTL is NOT
 * enforced here). Callers pair this with `cacheIsStale` to decide whether to
 * refresh in the background.
 */
export function cacheGet<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const entry: CacheEntry<T> = JSON.parse(item);
    if (entry.v !== CACHE_VERSION) {
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      v: CACHE_VERSION,
      ts: Date.now(),
      data,
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage errors
  }
}

export function cacheIsStale(key: string): boolean {
  try {
    const item = localStorage.getItem(key);
    if (!item) return true;

    const entry: CacheEntry<unknown> = JSON.parse(item);
    if (entry.v !== CACHE_VERSION) return true;

    const age = Date.now() - entry.ts;
    return age > CACHE_TTL;
  } catch {
    return true;
  }
}

export const CACHE_KEYS = {
  WEARABLES: "gc_wearables_v3", // v3: patched Rofl modifiers + bypass for pre-computed traits
  SETS: "gc_sets_v1",
  ADDRESSES: "gc_addresses_v1",
} as const;

