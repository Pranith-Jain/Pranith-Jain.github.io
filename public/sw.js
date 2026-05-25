/**
 * Service Worker — offline-first resilience for pranithjain.qzz.io
 *
 * Cache strategy:
 *   - Static assets (JS/CSS/fonts/images with hash in name): CacheFirst
 *   - Navigation requests (HTML pages): NetworkFirst, fallback to cache
 *   - API requests: NetworkOnly (always fresh data)
 *
 * On activate, stale caches from previous versions are deleted.
 * Cache version is derived from the build date embedded in the
 * import at build time.
 */
const CACHE_NAME = 'pj-portfolio-v1';

const ASSET_CACHE = `${CACHE_NAME}-assets`;
const PAGE_CACHE = `${CACHE_NAME}-pages`;

// Asset extensions that are content-hashed and safe to cache indefinitely.
const HASHED_ASSET_EXT = /\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/;

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

  // Static assets with hashed filenames: CacheFirst.
  if (HASHED_ASSET_EXT.test(url.pathname)) {
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
  const [cached, res] = await Promise.all([
    cache.match(request),
    fetch(request).catch(() => null),
  ]);
  if (res && res.ok) {
    await cache.put(request, res.clone());
    return res;
  }
  if (cached) return cached;
  if (res) return res;
  return new Response('Offline', { status: 503 });
}
