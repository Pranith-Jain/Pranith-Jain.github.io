import { injectScriptNonce } from './csp';
import { getOrInjectOg, injectOgMeta } from './og-rewriter';
import type { Env } from './env';

/**
 * Set of routes that have been prerendered to static HTML during the build
 * (see scripts/prerender.mjs). For these routes the Worker serves the
 * prerendered file directly so users see real content before React parses;
 * the SPA shell is reserved for fallback / unknown routes.
 *
 * Cloudflare Assets canonicalizes `*.html` paths by redirecting to the
 * extension-less form (e.g. /foo.html → 307 /foo). env.ASSETS.fetch()
 * returns the redirect verbatim and our code doesn't follow it, so we
 * have to ask for the canonical (extension-less) URL directly. The
 * file is still at __prerendered/<slug>.html on disk.
 *
 * Slug rule (must match scripts/prerender.mjs): '/' → 'home',
 * '/dfir/diamond' → 'dfir__diamond' (slashes replaced with double
 * underscore to avoid creating nested directories).
 */
const PRERENDERED_ROUTES = new Map<string, string>([
  // ── Portfolio ─────────────────────────────────────────────────
  ['/', '/__prerendered/home'],
  ['/about', '/__prerendered/about'],
  ['/skills', '/__prerendered/skills'],
  ['/experience', '/__prerendered/experience'],
  ['/projects', '/__prerendered/projects'],
  ['/blog', '/__prerendered/blog'],

  // ── Landings ──────────────────────────────────────────────────
  ['/dfir', '/__prerendered/dfir'],
  ['/threatintel', '/__prerendered/threatintel'],

  // ── DFIR: static catalogs & education ─────────────────────────
  ['/dfir/diamond', '/__prerendered/dfir__diamond'],
  ['/dfir/owasp', '/__prerendered/dfir__owasp'],
  ['/dfir/lolbins', '/__prerendered/dfir__lolbins'],
  ['/dfir/kill-chain', '/__prerendered/dfir__kill-chain'],
  ['/dfir/tabletop', '/__prerendered/dfir__tabletop'],
  ['/dfir/grc', '/__prerendered/dfir__grc'],
  ['/dfir/data-classification', '/__prerendered/dfir__data-classification'],
  ['/dfir/privacy-hub', '/__prerendered/dfir__privacy-hub'],

  // ── DFIR: utilities & decoders ────────────────────────────────
  ['/dfir/timestamp', '/__prerendered/dfir__timestamp'],
  ['/dfir/hash-calc', '/__prerendered/dfir__hash-calc'],
  ['/dfir/decode', '/__prerendered/dfir__decode'],
  ['/dfir/encoder', '/__prerendered/dfir__encoder'],
  ['/dfir/punycode', '/__prerendered/dfir__punycode'],
  ['/dfir/dork-builder', '/__prerendered/dfir__dork-builder'],
  ['/dfir/brand-impersonation', '/__prerendered/dfir__brand-impersonation'],

  // ── DFIR: image / media ───────────────────────────────────────
  ['/dfir/image-fingerprint', '/__prerendered/dfir__image-fingerprint'],
  ['/dfir/reverse-image', '/__prerendered/dfir__reverse-image'],
  ['/dfir/exif', '/__prerendered/dfir__exif'],

  // ── DFIR: file format analyzers ───────────────────────────────
  ['/dfir/plist-protobuf', '/__prerendered/dfir__plist-protobuf'],
  ['/dfir/pcap-triage', '/__prerendered/dfir__pcap-triage'],
  ['/dfir/registry-hive', '/__prerendered/dfir__registry-hive'],
  ['/dfir/evtx', '/__prerendered/dfir__evtx'],
  ['/dfir/sqlite', '/__prerendered/dfir__sqlite'],
  ['/dfir/ios-backup', '/__prerendered/dfir__ios-backup'],
  ['/dfir/mobile-sqlite', '/__prerendered/dfir__mobile-sqlite'],
  ['/dfir/apk-analyzer', '/__prerendered/dfir__apk-analyzer'],

  // ── DFIR: binary / log analyzers ──────────────────────────────
  ['/dfir/pe', '/__prerendered/dfir__pe'],
  ['/dfir/web-log', '/__prerendered/dfir__web-log'],
  ['/dfir/prefetch', '/__prerendered/dfir__prefetch'],
  ['/dfir/powershell-deobf', '/__prerendered/dfir__powershell-deobf'],
  ['/dfir/screenshot-intel', '/__prerendered/dfir__screenshot-intel'],

  // ── DFIR: detection & analysis ────────────────────────────────
  ['/dfir/rule-converter', '/__prerendered/dfir__rule-converter'],
  ['/dfir/rule-playground', '/__prerendered/dfir__rule-playground'],
  ['/dfir/yara', '/__prerendered/dfir__yara'],
  ['/dfir/detection-lab', '/__prerendered/dfir__detection-lab'],
  ['/dfir/prompt-injection', '/__prerendered/dfir__prompt-injection'],
  ['/dfir/mcp-audit', '/__prerendered/dfir__mcp-audit'],
  ['/dfir/agent-map', '/__prerendered/dfir__agent-map'],
  ['/dfir/cve-prioritizer', '/__prerendered/dfir__cve-prioritizer'],

  // ── DFIR: cloud security ──────────────────────────────────────
  ['/dfir/iam-analyzer', '/__prerendered/dfir__iam-analyzer'],
  ['/dfir/gcp-iam', '/__prerendered/dfir__gcp-iam'],
  ['/dfir/azure-rbac', '/__prerendered/dfir__azure-rbac'],
  ['/dfir/sg-analyzer', '/__prerendered/dfir__sg-analyzer'],
  ['/dfir/cloudtrail-triage', '/__prerendered/dfir__cloudtrail-triage'],
  ['/dfir/k8s-rbac', '/__prerendered/dfir__k8s-rbac'],
  ['/dfir/terraform-scan', '/__prerendered/dfir__terraform-scan'],

  // ── DFIR: API security ────────────────────────────────────────
  ['/dfir/openapi-audit', '/__prerendered/dfir__openapi-audit'],
  ['/dfir/sec-headers', '/__prerendered/dfir__sec-headers'],
  ['/dfir/secret-scan', '/__prerendered/dfir__secret-scan'],
  ['/dfir/graphql-audit', '/__prerendered/dfir__graphql-audit'],
  ['/dfir/osv-scan', '/__prerendered/dfir__osv-scan'],

  // ── DFIR: STIX ────────────────────────────────────────────────
  ['/dfir/stix', '/__prerendered/dfir__stix'],
  ['/dfir/stix-builder', '/__prerendered/dfir__stix-builder'],
  ['/dfir/ai-rule-generator', '/__prerendered/dfir__ai-rule-generator'],
  ['/dfir/threat-graph', '/__prerendered/dfir__threat-graph'],
  ['/dfir/attack-chain', '/__prerendered/dfir__attack-chain'],
  ['/dfir/hunting-query-generator', '/__prerendered/dfir__hunting-query-generator'],
  ['/dfir/sandbox', '/__prerendered/dfir__sandbox'],
  ['/dfir/ir-playbooks', '/__prerendered/dfir__ir-playbooks'],
  ['/dfir/stealer-parser', '/__prerendered/dfir__stealer-parser'],
  ['/dfir/taxii', '/__prerendered/dfir__taxii'],
  ['/dfir/bloom', '/__prerendered/dfir__bloom'],

  // ── DFIR: security frameworks ─────────────────────────────────
  ['/dfir/nhi', '/__prerendered/dfir__nhi'],
  ['/dfir/jwt', '/__prerendered/dfir__jwt'],
  ['/dfir/privacy', '/__prerendered/dfir__privacy'],

  // ── DFIR: dark web workbench ──────────────────────────────────
  ['/dfir/pgp-tool', '/__prerendered/dfir__pgp-tool'],
  ['/dfir/tor-gateway', '/__prerendered/dfir__tor-gateway'],

  // ── DFIR: tools that fetch /api/v1/* on mount ─────────────────
  ['/dfir/ioc-check', '/__prerendered/dfir__ioc-check'],
  ['/dfir/phishing', '/__prerendered/dfir__phishing'],
  ['/dfir/domain', '/__prerendered/dfir__domain'],
  ['/dfir/domain-rep', '/__prerendered/dfir__domain-rep'],
  ['/dfir/whois-history', '/__prerendered/dfir__whois-history'],
  // /dfir/sql-workspace removed: the page (SqlWorkspace.tsx) has no route in
  // App.tsx, so this mapped to a prerender that was never generated — it was
  // served as the bare SPA shell, cached 24h as "prerendered".
  ['/dfir/open-directory', '/__prerendered/dfir__open-directory'],
  ['/dfir/full-spectrum', '/__prerendered/dfir__full-spectrum'],
  ['/dfir/exposure', '/__prerendered/dfir__exposure'],
  ['/dfir/dashboard', '/__prerendered/dfir__dashboard'],
  ['/dfir/cve', '/__prerendered/dfir__cve'],
  ['/dfir/cert-search', '/__prerendered/dfir__cert-search'],
  ['/dfir/atlas', '/__prerendered/dfir__atlas'],
  ['/dfir/asn', '/__prerendered/dfir__asn'],
  ['/dfir/breach', '/__prerendered/dfir__breach'],
  ['/dfir/url-preview', '/__prerendered/dfir__url-preview'],
  ['/dfir/extract', '/__prerendered/dfir__extract'],
  ['/dfir/ioc-pivot', '/__prerendered/dfir__ioc-pivot'],
  ['/dfir/google-dorks', '/__prerendered/dfir__google-dorks'],
  ['/dfir/linux-triage', '/__prerendered/dfir__linux-triage'],
  ['/dfir/takeover', '/__prerendered/dfir__takeover'],
  ['/dfir/email-defense', '/__prerendered/dfir__email-defense'],
  ['/dfir/dmarc-analyzer', '/__prerendered/dfir__dmarc-analyzer'],
  ['/dfir/dlp-scan', '/__prerendered/dfir__dlp-scan'],
  ['/dfir/username', '/__prerendered/dfir__username'],
  ['/dfir/wayback', '/__prerendered/dfir__wayback'],
  ['/dfir/ip-geo', '/__prerendered/dfir__ip-geo'],
  ['/dfir/log-parser', '/__prerendered/dfir__log-parser'],
  ['/dfir/socmint', '/__prerendered/dfir__socmint'],
  ['/dfir/tools/about', '/__prerendered/dfir__tools__about'],
  ['/dfir/recon-bridge', '/__prerendered/dfir__recon-bridge'],
  ['/dfir/web-scan', '/__prerendered/dfir__web-scan'],
  ['/dfir/malware-scan', '/__prerendered/dfir__malware-scan'],
  ['/dfir/sample-scan', '/__prerendered/dfir__sample-scan'],
  ['/dfir/eml', '/__prerendered/dfir__eml'],
  ['/dfir/url-rep', '/__prerendered/dfir__url-rep'],
  ['/dfir/email-rep', '/__prerendered/dfir__email-rep'],
  ['/dfir/crypto-trace', '/__prerendered/dfir__crypto-trace'],

  // ── ThreatIntel: static catalogs ──────────────────────────────
  ['/threatintel/wiki', '/__prerendered/threatintel__wiki'],
  ['/threatintel/awesome-lists', '/__prerendered/threatintel__awesome-lists'],
  ['/threatintel/secops-tools', '/__prerendered/threatintel__secops-tools'],
  ['/threatintel/cve-resources', '/__prerendered/threatintel__cve-resources'],
  ['/threatintel/osint-framework', '/__prerendered/threatintel__osint-framework'],
  ['/threatintel/mitre', '/__prerendered/threatintel__mitre'],
  ['/threatintel/actor-kb', '/__prerendered/threatintel__actor-kb'],
  ['/threatintel/actor-dna', '/__prerendered/threatintel__actor-dna'],
  ['/threatintel/predictive', '/__prerendered/threatintel__predictive'],
  ['/threatintel/campaign-lifecycle', '/__prerendered/threatintel__campaign-lifecycle'],
  ['/threatintel/attribution', '/__prerendered/threatintel__attribution'],
  ['/threatintel/intelligence-gaps', '/__prerendered/threatintel__intelligence-gaps'],
  ['/threatintel/cross-campaign', '/__prerendered/threatintel__cross-campaign'],
  ['/threatintel/actors', '/__prerendered/threatintel__actors'],
  ['/threatintel/rules', '/__prerendered/threatintel__rules'],
  ['/threatintel/briefings', '/__prerendered/threatintel__briefings'],

  // ── ThreatIntel: pages ────────────────────────────────────────
  ['/threatintel/about', '/__prerendered/threatintel__about'],
  ['/threatintel/external-resources', '/__prerendered/threatintel__external-resources'],

  // ── ThreatIntel: live-feed surfaces ───────────────────────────
  ['/threatintel/pulse', '/__prerendered/threatintel__pulse'],
  ['/threatintel/darkweb', '/__prerendered/threatintel__darkweb'],
  ['/threatintel/ransomware-map', '/__prerendered/threatintel__ransomware-map'],
  ['/threatintel/certstream', '/__prerendered/threatintel__certstream'],
  ['/threatintel/campaign-generator', '/__prerendered/threatintel__campaign-generator'],
  ['/threatintel/campaigns', '/__prerendered/threatintel__campaigns'],
  ['/threatintel/malicious-packages', '/__prerendered/threatintel__malicious-packages'],
  ['/threatintel/x-watch', '/__prerendered/threatintel__x-watch'],
  ['/threatintel/x-live', '/__prerendered/threatintel__x-live'],
  ['/threatintel/mythreatintel', '/__prerendered/threatintel__mythreatintel'],
  ['/threatintel/cybersec', '/__prerendered/threatintel__cybersec'],
  ['/threatintel/breach', '/__prerendered/threatintel__breach'],
  ['/threatintel/reddit', '/__prerendered/threatintel__reddit'],
  ['/threatintel/x', '/__prerendered/threatintel__x'],
  ['/threatintel/status', '/__prerendered/threatintel__status'],
  ['/threatintel/metrics', '/__prerendered/threatintel__metrics'],
  ['/threatintel/correlation', '/__prerendered/threatintel__correlation'],
  ['/threatintel/actor-timeline', '/__prerendered/threatintel__actor-timeline'],
  ['/threatintel/re-leaks', '/__prerendered/threatintel__re-leaks'],
  ['/threatintel/c2-tracker', '/__prerendered/threatintel__c2-tracker'],
  ['/threatintel/signal', '/__prerendered/threatintel__signal'],
  ['/threatintel/research', '/__prerendered/threatintel__research'],
  ['/threatintel/cve-list', '/__prerendered/threatintel__cve-list'],

  ['/threatintel/threat-map', '/__prerendered/threatintel__threat-map'],
  ['/threatintel/deepdarkcti', '/__prerendered/threatintel__deepdarkcti'],
  ['/threatintel/ransomware-live', '/__prerendered/threatintel__ransomware-live'],
  ['/threatintel/infostealer', '/__prerendered/threatintel__infostealer'],
  ['/threatintel/feed-sources', '/__prerendered/threatintel__feed-sources'],
  ['/threatintel/settings', '/__prerendered/threatintel__settings'],
  ['/threatintel/negotiations', '/__prerendered/threatintel__negotiations'],
  ['/threatintel/maltrail', '/__prerendered/threatintel__maltrail'],
  ['/threatintel/malpedia', '/__prerendered/threatintel__malpedia'],
  ['/threatintel/breach-forums', '/__prerendered/threatintel__breach-forums'],
  ['/threatintel/domain-monitor', '/__prerendered/threatintel__domain-monitor'],
  ['/threatintel/scam-watch', '/__prerendered/threatintel__scam-watch'],
  ['/threatintel/tech-ai-news', '/__prerendered/threatintel__tech-ai-news'],
  ['/threatintel/onion-watch', '/__prerendered/threatintel__onion-watch'],
  ['/threatintel/telegram-watch', '/__prerendered/threatintel__telegram-watch'],
  ['/threatintel/telegram-settings', '/__prerendered/threatintel__telegram-settings'],
  ['/threatintel/misp-browser', '/__prerendered/threatintel__misp-browser'],
  ['/threatintel/search', '/__prerendered/threatintel__search'],
  ['/threatintel/ioc-enrichment', '/__prerendered/threatintel__ioc-enrichment'],
  ['/threatintel/copilot', '/__prerendered/threatintel__copilot'],
  ['/threatintel/watches', '/__prerendered/threatintel__watches'],
  ['/threatintel/threat-feeds', '/__prerendered/threatintel__threat-feeds'],
  ['/threatintel/writeups', '/__prerendered/threatintel__writeups'],
  ['/threatintel/cyber-crime', '/__prerendered/threatintel__cyber-crime'],
  ['/threatintel/ransomware-activity', '/__prerendered/threatintel__ransomware-activity'],
  ['/threatintel/live-iocs', '/__prerendered/threatintel__live-iocs'],
  ['/threatintel/detections', '/__prerendered/threatintel__detections'],
  ['/threatintel/assessments', '/__prerendered/threatintel__assessments'],
  ['/threatintel/feed-quality', '/__prerendered/threatintel__feed-quality'],

  // ── Phase 4 (2026-06-04): 43 real static routes that existed in App.tsx
  //    but had no entry here, so they were served as the bare SPA shell.
  //    See scripts/prerender.mjs for the matching ROUTES entries.

  // ── Portfolio (2) ────────────────────────────────────────────
  ['/admin', '/__prerendered/admin'],
  ['/copilot', '/__prerendered/copilot'],

  // ── DFIR: real pages (10) ────────────────────────────────────
  ['/dfir/abuse-rep', '/__prerendered/dfir__abuse-rep'],
  ['/dfir/asset-intel', '/__prerendered/dfir__asset-intel'],
  ['/dfir/blocklists', '/__prerendered/dfir__blocklists'],
  ['/dfir/ct-monitor', '/__prerendered/dfir__ct-monitor'],
  ['/dfir/file', '/__prerendered/dfir__file'],
  ['/dfir/host-graph', '/__prerendered/dfir__host-graph'],
  ['/dfir/identity-lookup', '/__prerendered/dfir__identity-lookup'],
  ['/dfir/ioc-lifecycle', '/__prerendered/dfir__ioc-lifecycle'],
  ['/dfir/report-parser', '/__prerendered/dfir__report-parser'],
  ['/dfir/threat-hunt', '/__prerendered/dfir__threat-hunt'],

  // ── ThreatIntel: real pages, not redirects (28) ──────────────
  ['/threatintel/ach', '/__prerendered/threatintel__ach'],
  ['/threatintel/actor-usernames', '/__prerendered/threatintel__actor-usernames'],
  ['/threatintel/aggregated-feeds', '/__prerendered/threatintel__aggregated-feeds'],
  ['/threatintel/analyze', '/__prerendered/threatintel__analyze'],
  ['/threatintel/atlas', '/__prerendered/threatintel__atlas'],
  ['/threatintel/collection-slo', '/__prerendered/threatintel__collection-slo'],
  ['/threatintel/cross-correlate', '/__prerendered/threatintel__cross-correlate'],
  ['/threatintel/crypto-scams', '/__prerendered/threatintel__crypto-scams'],
  ['/threatintel/darkweb-tools', '/__prerendered/threatintel__darkweb-tools'],
  ['/threatintel/entity-resolution', '/__prerendered/threatintel__entity-resolution'],
  ['/threatintel/feed-catalog', '/__prerendered/threatintel__feed-catalog'],
  ['/threatintel/feed-scheduler', '/__prerendered/threatintel__feed-scheduler'],
  ['/threatintel/insider-threat-matrix', '/__prerendered/threatintel__insider-threat-matrix'],
  ['/threatintel/intel-dashboard', '/__prerendered/threatintel__intel-dashboard'],
  ['/threatintel/investigations', '/__prerendered/threatintel__investigations'],
  ['/threatintel/malware-iocs', '/__prerendered/threatintel__malware-iocs'],
  ['/threatintel/malware-vault', '/__prerendered/threatintel__malware-vault'],
  ['/threatintel/observable-db', '/__prerendered/threatintel__observable-db'],
  ['/threatintel/phishing-wordlists', '/__prerendered/threatintel__phishing-wordlists'],
  ['/threatintel/pir-dashboard', '/__prerendered/threatintel__pir-dashboard'],
  ['/threatintel/projectdiscovery', '/__prerendered/threatintel__projectdiscovery'],
  ['/threatintel/ransom-payments', '/__prerendered/threatintel__ransom-payments'],
  ['/threatintel/ransom-report', '/__prerendered/threatintel__ransom-report'],
  ['/threatintel/relationship-graph', '/__prerendered/threatintel__relationship-graph'],
  ['/threatintel/source-reliability', '/__prerendered/threatintel__source-reliability'],
  ['/threatintel/telegram-leaks', '/__prerendered/threatintel__telegram-leaks'],
  ['/threatintel/telegram-leaks/channels', '/__prerendered/threatintel__telegram-leaks__channels'],
  ['/threatintel/telegram-leaks/stats', '/__prerendered/threatintel__telegram-leaks__stats'],
  ['/threatintel/yara', '/__prerendered/threatintel__yara'],
]);

/**
 * Dynamic route patterns that should fall back to a parent page's
 * prerendered HTML. The client-side React Router handles the dynamic
 * parameter (e.g. :slug), but the Worker still has to serve real HTML
 * (not the empty SPA shell) so the page chrome paints before hydration
 * and the URL the user sees matches the actual content.
 *
 * Each entry: [regex matching the dynamic path, prerendered parent to
 * serve]. Patterns are case-insensitive because some slugs contain
 * uppercase letters — notably the ISO-week label in weekly briefings
 * (`weekly-2026-W22` from isoYearWeek() in api/src/lib/briefing-builder.ts),
 * but also actor handles and other identifiers that may mix case.
 *
 * Regression note: this table was originally added to worker/index.ts
 * in commit 743be0a ("fix: handle dynamic routes with fallback to
 * parent prerendered pages") and was lost when commit f921102 split
 * the worker into modules. The original patterns used `[a-z0-9-]+`
 * which never matched the uppercase `W` in weekly slugs, so even with
 * the table restored, `weekly-2026-W22` would still have shell-served.
 * Patterns below use `/i` to cover that case.
 *
 * The slug here is intentionally permissive (any non-empty path
 * segment) so future dynamic routes added to App.tsx don't need a
 * worker change to render — just an entry in PRERENDERED_ROUTES for
 * the parent and a slug-aware React Router <Route>.
 */
const DYNAMIC_ROUTE_FALLBACKS: ReadonlyArray<[RegExp, string]> = [
  // ── ThreatIntel category / sub-pages ───────────────────────────
  [/^\/threatintel\/c\/[^/]+$/i, '/__prerendered/threatintel'],
  [/^\/threatintel\/wiki\/[^/]+$/i, '/__prerendered/threatintel__wiki'],
  [/^\/threatintel\/actors\/[^/]+$/i, '/__prerendered/threatintel__actors'],
  [/^\/threatintel\/briefings\/[^/]+$/i, '/__prerendered/threatintel__briefings'],
  [/^\/threatintel\/campaigns\/[^/]+$/i, '/__prerendered/threatintel__campaigns'],
  [/^\/threatintel\/research\/[^/]+$/i, '/__prerendered/threatintel__research'],
  [/^\/threatintel\/infostealer\/[^/]+$/i, '/__prerendered/threatintel__infostealer'],
  [/^\/threatintel\/assessments\/[^/]+$/i, '/__prerendered/threatintel__assessments'],
  // ── Blog ───────────────────────────────────────────────────────
  [/^\/blog\/c\/[^/]+$/i, '/__prerendered/blog'],
  [/^\/blog\/[^/]+$/i, '/__prerendered/blog'],
  // ── Projects ───────────────────────────────────────────────────
  [/^\/projects\/[^/]+$/i, '/__prerendered/projects'],
  // ── DFIR tools category ────────────────────────────────────────
  [/^\/dfir\/tools\/[^/]+$/i, '/__prerendered/dfir'],
];

function resolveDynamicRoute(pathname: string): string | null {
  for (const [pattern, fallback] of DYNAMIC_ROUTE_FALLBACKS) {
    if (pattern.test(pathname)) {
      return fallback;
    }
  }
  return null;
}

export async function fetchPrerenderedOrShell(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  nonce: string
): Promise<Response> {
  // Try exact match first; fall back to a dynamic-route parent if the
  // exact path isn't a prerendered page.
  const prerenderedPath = PRERENDERED_ROUTES.get(url.pathname) ?? resolveDynamicRoute(url.pathname);
  if (!prerenderedPath) {
    const r = await getOrInjectOg(request, env, ctx, url);
    // Pass through non-HTML assets (images, fonts, WASM, JSON) as-is.
    // Calling r.text() on binary data would decode bytes as UTF-8 and
    // corrupt them — PNGs, WASM, and fonts contain non-UTF-8 byte
    // sequences that get replaced with U+FFFD.
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('text/html')) return r;
    const body = injectScriptNonce(await r.text(), nonce);
    const h = new Headers(r.headers);
    h.set('x-ssr-source', 'spa-shell');
    // SPA shell references content-hashed JS/CSS chunks that are safe
    // to cache immutably, but the shell HTML itself must refresh on
    // every deploy so users pick up new lazy chunks (e.g. a new
    // NotFound page, the React Router table). `max-age=0, must-revalidate`
    // makes the browser revalidate on every load; the asset layer's etag
    // returns 304 for unchanged shells (cheap) and 200 for new ones, so
    // a returning visitor never serves a stale shell that imports a
    // since-deleted chunk.
    h.set('cache-control', 'public, max-age=0, must-revalidate');
    return new Response(body, { status: r.status, statusText: r.statusText, headers: h });
  }
  const internal = new URL(request.url);
  internal.pathname = prerenderedPath;
  const prerenderRes = await env.ASSETS.fetch(new Request(internal.toString(), request));
  if (prerenderRes.status === 404) {
    const r = await getOrInjectOg(request, env, ctx, url);
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('text/html')) return r;
    const body = injectScriptNonce(await r.text(), nonce);
    const h = new Headers(r.headers);
    h.set('x-ssr-source', 'shell-fallback-404');
    // Same aggressive no-cache as the SPA shell — these are unknown
    // routes that render the wildcard NotFound component, which
    // itself changes on every deploy (e.g. "Did you mean"
    // suggestions, section grid). Users opening an old bookmark must
    // see the latest not-found experience, not a 24h-old version.
    h.set('cache-control', 'public, max-age=0, must-revalidate');
    return new Response(body, { status: r.status, statusText: r.statusText, headers: h });
  }
  const ogRewritten = await injectOgMeta(prerenderRes, url, env, ctx, nonce);
  const headers = new Headers(ogRewritten.headers);
  // A prerendered shell references the same content-hashed JS/CSS chunks as
  // the SPA shell, and those chunk filenames change (and the old ones are
  // deleted) on every deploy. Caching this HTML in the *browser* for a day
  // means a returning visitor serves a stale shell that imports a now-404'd
  // lazy chunk → the app crashes into the "Update available" boundary. So it
  // must revalidate on every load, exactly like the SPA-shell and 404 paths
  // above. The worker's own etag-keyed Cache API entry (see injectOgMeta)
  // is unaffected by this header, so server-side hit rate is preserved.
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.set('x-ssr-source', 'prerendered');
  return new Response(ogRewritten.body, {
    status: ogRewritten.status,
    statusText: ogRewritten.statusText,
    headers,
  });
}
