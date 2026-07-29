/**
 * Service Worker — offline-first resilience for pranithjain.qzz.io
 *
 * Cache strategy:
 *   - /assets/* (content-hashed JS/CSS/fonts/images): CacheFirst. These
 *     URLs are immutable by construction (new build = new hash), so a
 *     cache hit can never serve stale code.
 *   - Other same-origin statics (/fonts/fonts.css, favicon, JSON data,
 *     wasm): stale-while-revalidate. These URLs are NOT hashed, so
 *     CacheFirst would pin the first version forever and updates would
 *     never reach returning visitors.
 *   - Navigation requests (HTML pages): NetworkFirst, fallback to cache.
 *   - API requests: NetworkOnly (always fresh data).
 *
 * Cache names are intentionally stable (no per-build version bump):
 * hashed assets self-invalidate via their URL, and the asset cache is
 * capped (oldest entries evicted) so it can't grow without bound across
 * deploys.
 */
const CACHE_NAME = 'pj-portfolio-v1';

const ASSET_CACHE = `${CACHE_NAME}-assets`;
const PAGE_CACHE = `${CACHE_NAME}-pages`;

// Upper bound on cached /assets/ entries. Each deploy ships new hashed
// chunks while old ones stay cached for open tabs; evict oldest-first
// past this cap so the cache tracks roughly two builds' worth of assets
// instead of every build ever served.
const MAX_ASSET_ENTRIES = 250;

// Routes that have prerendered HTML. Each is cached individually so a
// network-first navigation always has a fallback.
const PRERENDERED_ROUTES = [
  '/',
  '/about',
  '/skills',
  '/experience',
  '/projects',
  '/dfir',
  '/threatintel',
  '/threatintel/wiki',
  '/threatintel/awesome-lists',
  '/threatintel/secops-tools',
  '/threatintel/cve-resources',
  '/threatintel/osint-framework',
  '/dfir/diamond',
  '/dfir/owasp',
  '/dfir/lolbins',
  '/dfir/kill-chain',
  '/dfir/tabletop',
  '/dfir/grc',
  '/dfir/data-classification',
  '/dfir/privacy-hub',
];

// ─── Install ───────────────────────────────────────────────────────
// Pre-cache the SPA shell + known prerendered routes so navigations
// to any of them work offline immediately. Routes not in the list
// are cached on first visit via NetworkFirst.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      const routes = ['/', ...PRERENDERED_ROUTES.filter((r) => r !== '/')];
      const results = await Promise.allSettled(
        routes.map(async (url) => {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        })
      );
      // Some routes may fail during install (deploy overlap, etc).
      // NetworkFirst in fetch will backfill them on first visit.
    })()
  );
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Clear old caches.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== ASSET_CACHE && key !== PAGE_CACHE) return caches.delete(key);
        })
      );
    })()
  );
  // Take control of all clients immediately.
  clients.claim();
});

// ─── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // API requests: always network, no caching.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Content-hashed build artifacts: CacheFirst (immutable URLs).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Navigation requests (HTML pages): NetworkFirst with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGE_CACHE));
    return;
  }

  // Everything else (e.g. /manifest.json): stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

// ─── Cache Strategies ──────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, res.clone());
      // Evict oldest entries past the cap (keys() is insertion-ordered).
      const keys = await cache.keys();
      if (keys.length > MAX_ASSET_ENTRIES) {
        await cache.delete(keys[0]);
      }
    }
    return res;
  } catch (err) {
    // Network unavailable and nothing in cache.
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // No cached page — try the root SPA shell as a last resort.
    const shell = await caches.match('/');
    if (shell) return shell;
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const [cached, res] = await Promise.all([cache.match(request), fetch(request).catch(() => null)]);
  if (res && res.ok) {
    await cache.put(request, res.clone());
    return res;
  }
  if (cached) return cached;
  if (res) return res;
  return new Response('Offline', { status: 503 });
}
