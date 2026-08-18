interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttl: number;
}

const store = new Map<string, CacheEntry>();
const CACHE_MAX = 200;
const inFlight = new Map<string, Promise<unknown>>();
let evictTimer: ReturnType<typeof setInterval> | null = null;

// ── SessionStorage persistence ─────────────────────────────────────────────
// The Map alone is wiped by a hard reload, so every page re-fetches all of
// its endpoints on refresh. Persisting a capped snapshot to sessionStorage
// (per-tab, cleared when the tab closes) lets the SWR hooks paint cached
// data instantly and revalidate in the background instead of blocking on
// the network. Entries are dropped on hydrate when their TTL has expired,
// so the snapshot never serves data older than the in-memory semantics.
const PERSIST_KEY = 'mc:v1';
/** Keep well under the ~5MB sessionStorage quota. */
const PERSIST_MAX_BYTES = 1_500_000;
/** Skip individual payloads too large to be worth persisting (e.g. 1000-row
 *  IOC dumps) - they re-fetch fine and would crowd out smaller entries. */
const PERSIST_MAX_ENTRY_BYTES = 200_000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function approxSize(key: string, entry: CacheEntry): number {
  let n = 0;
  try {
    n = JSON.stringify(entry.data).length;
  } catch {
    /* non-serializable payload - skip via the cap below */
  }
  return key.length + n + 96;
}

function persistNow(): void {
  if (typeof window === 'undefined') return;
  try {
    const entries: Array<[string, CacheEntry]> = [];
    let total = 0;
    const now = Date.now();
    for (const [k, v] of store) {
      if (now - v.fetchedAt >= v.ttl) continue; // expired
      const size = approxSize(k, v);
      if (size > PERSIST_MAX_ENTRY_BYTES) continue;
      total += size;
      if (total > PERSIST_MAX_BYTES) break;
      entries.push([k, v]);
    }
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage unavailable - drop the stale snapshot rather
    // than throw (caching must never break a page).
    try {
      sessionStorage.removeItem(PERSIST_KEY);
    } catch {
      /* noop */
    }
  }
}

function schedulePersist(): void {
  if (typeof window === 'undefined') return;
  if (persistTimer !== null) return;
  // Debounce: a page load fires many fetches in parallel; serializing the
  // whole snapshot per set would jank the main thread. 500ms after the last
  // mutation is plenty for a reload mid-navigation, and pagehide flushes.
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, 500);
}

function hydrate(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<[string, CacheEntry]>;
    const now = Date.now();
    for (const [k, v] of entries) {
      if (now - v.fetchedAt >= v.ttl) continue; // never hydrate stale data
      if (!store.has(k)) store.set(k, v);
    }
    if (store.size > 0) startEvictTimer();
  } catch {
    /* corrupt snapshot - ignore, will be overwritten on next persist */
  }
}

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
  schedulePersist();
}

hydrate();

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', evictExpired);
  // Flush the latest snapshot synchronously when the tab is being closed or
  // hidden, so a quick reload still lands on cached data.
  window.addEventListener('pagehide', persistNow);
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
      // Evict expired entries first, then oldest if still over limit.
      evictExpired();
      while (store.size >= CACHE_MAX) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
        else break;
      }
    }
    store.set(key, { data, fetchedAt: now, ttl });
    startEvictTimer();
    schedulePersist();
  },

  delete(key: string): void {
    store.delete(key);
    schedulePersist();
  },

  clear(): void {
    store.clear();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(PERSIST_KEY);
      } catch {
        /* noop */
      }
    }
    schedulePersist();
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
