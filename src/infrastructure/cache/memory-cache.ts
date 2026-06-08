interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttl: number;
}

const store = new Map<string, CacheEntry>();
const CACHE_MAX = 200;
const inFlight = new Map<string, Promise<unknown>>();
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
    store.delete(key);
    if (store.size >= CACHE_MAX) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
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

  dedup<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    const hit = store.get(key);
    if (hit && Date.now() - hit.fetchedAt < hit.ttl) {
      return Promise.resolve(hit.data as T);
    }
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const promise = fetcher()
      .then((data) => {
        inFlight.delete(key);
        memoryCache.set(key, data, ttl);
        return data;
      })
      .catch((err) => {
        inFlight.delete(key);
        throw err;
      });
    inFlight.set(key, promise);
    return promise;
  },
};
