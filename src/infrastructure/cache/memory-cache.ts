interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttl: number;
}

const store = new Map<string, CacheEntry>();
const CACHE_MAX = 200;
let evictTimer: ReturnType<typeof setInterval> | null = null;

function startEvictTimer(): void {
  if (evictTimer === null && typeof window !== 'undefined') {
    evictTimer = setInterval(evictExpired, 60_000);
  }
}

function stopEvictTimer(): void {
  if (evictTimer !== null) {
    clearInterval(evictTimer);
    evictTimer = null;
  }
}

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.fetchedAt >= v.ttl) store.delete(k);
  }
  if (store.size === 0) stopEvictTimer();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', evictExpired);
}

export const memoryCache = {
  get<T>(key: string): { data: T; fresh: boolean } | null {
    const entry = store.get(key);
    if (!entry) return null;
    const fresh = Date.now() - entry.fetchedAt < entry.ttl;
    return { data: entry.data as T, fresh };
  },

  set<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    if (store.size >= CACHE_MAX) {
      let oldest: string | undefined;
      let oldestTime = now;
      for (const [k, v] of store) {
        if (v.fetchedAt < oldestTime) {
          oldest = k;
          oldestTime = v.fetchedAt;
        }
      }
      if (oldest) store.delete(oldest);
    }
    store.set(key, { data, fetchedAt: now, ttl });
    startEvictTimer();
  },

  delete(key: string): void {
    store.delete(key);
  },

  clear(): void {
    store.clear();
  },
};
