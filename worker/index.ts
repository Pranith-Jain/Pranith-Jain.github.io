import apiApp from '../api/src/index';
import {
  BRIEFING_MAX_AGE_DAYS,
  buildBriefing,
  writeBriefing,
  sweepOldBriefings,
  expectedWeeklySlug,
} from '../api/src/lib/briefing-builder';
import { runDiscoveryNow, runPlannerNow, runPublisherNow, type CaseStudyEnv } from '../api/src/case-study/run';
import { runTelegramArchive } from '../api/src/routes/telegram-archive';
import { warmIntelBundles } from '../api/src/lib/intel-bundle-warm';
import { checkWatches } from '../api/src/lib/watch-engine';
import { buildBlocklists } from '../api/src/lib/blocklist-builder';
import type { Env as ApiEnv } from '../api/src/env';
import type { Ai, D1Database } from '@cloudflare/workers-types';
import { LiveFeedDO } from './durable-objects/live-feed';
import { DfirMcpServer } from './mcp-server';
import { CANONICAL_ORIGIN, OG_CACHE_TTL_SECONDS, getOrInjectOg, injectOgMeta } from './og';
import { ogImageResponse } from './og-image';

/** Generate a cryptographic nonce for CSP. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Inject nonce into inline script tags. */
function injectScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script(?=[^>]*>)/, `<script nonce="${nonce}"`);
}

/** Add security headers to a response. */
function withSecurityHeaders(response: Response, nonce?: string): Response {
  const headers = new Headers(response.headers);

  // CSP — the meta tag in index.html already has a policy for inline
  // scripts ('unsafe-inline'). The HTTP header CSP adds the nonce for
  // the theme-flash script but MUST NOT use 'strict-dynamic' because
  // that blocks external <script src> tags that don't carry the nonce.
  // Both policies are applied (most restrictive wins), so we keep this
  // permissive enough that the bundled JS can load.
  const scriptSrc = nonce ? `'self' 'nonce-${nonce}' 'unsafe-inline'` : `'self' 'unsafe-inline'`;

  headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src ${scriptSrc} https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { LiveFeedDO, DfirMcpServer };

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
  LIVE_FEED_DO: DurableObjectNamespace<LiveFeedDO>;
  DFIR_MCP: DurableObjectNamespace<DfirMcpServer>;
  R2_FILES?: R2Bucket;
  NVD_API_KEY?: string;
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  SHODAN_API_KEY?: string;
  CENSYS_PAT?: string;
  CENSYS_ORG_ID?: string;
  NETLAS_API_KEY?: string;
  OTX_API_KEY?: string;
  URLSCAN_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
  ABUSECH_AUTH_KEY?: string;
  RANSOMWARELIVE_API_KEY?: string;
  CROWDSEC_API_KEY?: string;
  IPINFO_TOKEN?: string;
  CRIMINALIP_API_KEY?: string;
}

/**
 * Set of routes that have been prerendered to static HTML during the build
 * (see scripts/prerender.mjs). For these routes the Worker serves the
 * prerendered file directly so users see real content before React parses;
 * the SPA shell is reserved for fallback / unknown routes.
 *
 * Phase 2 (2026-05-12) ships only `/`. Phase 3 expanded to 20 static
 * content routes; Phase 3.1 added 5 live-feed surfaces whose prerendered
 * HTML contains chrome + loading-state, with data hydrated client-side.
 */
// Cloudflare Assets canonicalizes `*.html` paths by redirecting to the
// extension-less form (e.g. /foo.html → 307 /foo). env.ASSETS.fetch()
// returns the redirect verbatim and our code doesn't follow it, so we
// have to ask for the canonical (extension-less) URL directly. The
// file is still at __prerendered/<slug>.html on disk.
//
// Slug rule (must match scripts/prerender.mjs): '/' → 'home',
// '/dfir/diamond' → 'dfir__diamond' (slashes replaced with double
// underscore to avoid creating nested directories).
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
  ['/dfir/report-parser', '/__prerendered/dfir__report-parser'],
  ['/dfir/ioc-lifecycle', '/__prerendered/dfir__ioc-lifecycle'],
  ['/dfir/ct-monitor', '/__prerendered/dfir__ct-monitor'],
  ['/dfir/stealer-parser', '/__prerendered/dfir__stealer-parser'],
  ['/dfir/taxii', '/__prerendered/dfir__taxii'],
  ['/dfir/bloom', '/__prerendered/dfir__bloom'],
  ['/dfir/ai-rule-generator', '/__prerendered/dfir__ai-rule-generator'],
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

  // ── DFIR: security frameworks ─────────────────────────────────
  ['/dfir/nhi', '/__prerendered/dfir__nhi'],
  ['/dfir/jwt', '/__prerendered/dfir__jwt'],
  ['/dfir/privacy', '/__prerendered/dfir__privacy'],

  // ── DFIR: dark web workbench ──────────────────────────────────
  ['/dfir/pgp-tool', '/__prerendered/dfir__pgp-tool'],
  ['/dfir/tor-gateway', '/__prerendered/dfir__tor-gateway'],

  // ── DFIR: tools that fetch /api/v1/* on mount ─────────────────
  // Prerendered chrome + loading state, client hydrates.
  ['/dfir/ioc-check', '/__prerendered/dfir__ioc-check'],
  ['/dfir/phishing', '/__prerendered/dfir__phishing'],
  ['/dfir/domain', '/__prerendered/dfir__domain'],
  ['/dfir/domain-rep', '/__prerendered/dfir__domain-rep'],
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
  ['/dfir/web-scan', '/__prerendered/dfir__web-scan'],
  ['/dfir/malware-scan', '/__prerendered/dfir__malware-scan'],
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
  ['/threatintel/actors', '/__prerendered/threatintel__actors'],
  ['/threatintel/rules', '/__prerendered/threatintel__rules'],
  ['/threatintel/briefings', '/__prerendered/threatintel__briefings'],

  // ── ThreatIntel: pages ────────────────────────────────────────
  ['/threatintel/about', '/__prerendered/threatintel__about'],
  ['/threatintel/external-resources', '/__prerendered/threatintel__external-resources'],

  // ── Standalone copilot route ──────────────────────────────────
  ['/copilot', '/__prerendered/threatintel__copilot'],

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
  ['/threatintel/cve-threat-map', '/__prerendered/threatintel__cve-threat-map'],
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
]);

/**
 * Dynamic route patterns that should fall back to their parent page's
 * prerendered HTML. The client-side React Router handles the dynamic
 * parameter, but we need to serve real HTML (not the empty SPA shell)
 * so the page isn't blank before hydration.
 *
 * Pattern: [/prefix/:param, /parent-prerendered-path]
 */
const DYNAMIC_ROUTE_FALLBACKS: Array<[RegExp, string]> = [
  // ThreatIntel category pages
  [/^\/threatintel\/c\/[a-z0-9-]+$/, '/__prerendered/threatintel'],
  // ThreatIntel sub-pages with dynamic slugs
  [/^\/threatintel\/wiki\/[a-z0-9-]+$/, '/__prerendered/threatintel__wiki'],
  [/^\/threatintel\/actors\/[a-z0-9-]+$/, '/__prerendered/threatintel__actors'],
  [/^\/threatintel\/briefings\/[a-z0-9-]+$/, '/__prerendered/threatintel__briefings'],
  [/^\/threatintel\/campaigns\/[a-z0-9-]+$/, '/__prerendered/threatintel__campaigns'],
  [/^\/threatintel\/research\/[a-z0-9-]+$/, '/__prerendered/threatintel__research'],
  [/^\/threatintel\/infostealer\/[a-z0-9-]+$/, '/__prerendered/threatintel__infostealer'],
  // Blog pages
  [/^\/blog\/[a-z0-9-]+$/, '/__prerendered/blog'],
  [/^\/blog\/c\/[a-z0-9-]+$/, '/__prerendered/blog'],
  // Projects
  [/^\/projects\/[a-z0-9-]+$/, '/__prerendered/projects'],
  // DFIR tools category
  [/^\/dfir\/tools\/[a-z0-9-]+$/, '/__prerendered/dfir'],
  // DFIR briefings
  [/^\/dfir\/briefings\/[a-z0-9-]+$/, '/__prerendered/threatintel__briefings'],
];

function resolveDynamicRoute(pathname: string): string | null {
  for (const [pattern, fallback] of DYNAMIC_ROUTE_FALLBACKS) {
    if (pattern.test(pathname)) {
      return fallback;
    }
  }
  return null;
}

async function fetchPrerenderedOrShell(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  nonce: string
): Promise<Response> {
  // Try exact match first
  let prerenderedPath = PRERENDERED_ROUTES.get(url.pathname);

  // If no exact match, try dynamic route fallbacks
  if (!prerenderedPath) {
    prerenderedPath = resolveDynamicRoute(url.pathname);
  }

  if (!prerenderedPath) {
    const r = await getOrInjectOg(request, env, ctx, url);
    const body = injectScriptNonce(await r.text(), nonce);
    const h = new Headers(r.headers);
    h.set('x-ssr-source', 'spa-shell');
    return new Response(body, { status: r.status, statusText: r.statusText, headers: h });
  }
  const internal = new URL(request.url);
  internal.pathname = prerenderedPath;
  const prerenderRes = await env.ASSETS.fetch(new Request(internal.toString(), request));
  if (prerenderRes.status === 404) {
    const r = await getOrInjectOg(request, env, ctx, url);
    const body = injectScriptNonce(await r.text(), nonce);
    const h = new Headers(r.headers);
    h.set('x-ssr-source', 'shell-fallback-404');
    return new Response(body, { status: r.status, statusText: r.statusText, headers: h });
  }
  // Apply the OG rewrite to the prerendered HTML before the nonce pass.
  // Without this, prerendered routes (everything in PRERENDERED_ROUTES,
  // notably /, /threatintel, /dfir, /projects) shipped the build-time
  // index.html metadata — meaning every share-preview, canonical URL,
  // and title was the portfolio default regardless of which surface
  // the visitor actually landed on. The fallback (SPA-shell) branch
  // already ran getOrInjectOg(); this brings the prerendered branch
  // into parity. Same per-route OG_OVERRIDES drive both branches now.
  //
  // Cache the OG-rewritten + nonce-stripped HTML in the Cache API keyed
  // by pathname@etag so redeployments bust stale entries (same pattern
  // as getOrInjectOg). On cache hit we skip the OG rewrite entirely and
  // only inject the per-request nonce.
  const etag = prerenderRes.headers.get('etag') ?? prerenderRes.headers.get('last-modified') ?? 'unversioned';
  const cache = caches.default;
  const REWRITE_VERSION = 'v3';
  const prerenderCacheKey = new Request(
    `https://prerendered-og.internal/${REWRITE_VERSION}/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
  );
  const prerenderCacheHit = await cache.match(prerenderCacheKey);
  if (prerenderCacheHit) {
    const body = injectScriptNonce(await prerenderCacheHit.text(), nonce);
    const h = new Headers(prerenderCacheHit.headers);
    h.set('x-ssr-source', 'prerendered-cache');
    return new Response(body, {
      status: prerenderCacheHit.status,
      statusText: prerenderCacheHit.statusText,
      headers: h,
    });
  }

  const ogRewritten = await injectOgMeta(prerenderRes, url, env);
  const ogHeaders = new Headers(ogRewritten.headers);
  ogHeaders.set('cache-control', `public, max-age=${OG_CACHE_TTL_SECONDS}`);
  ogHeaders.set('x-ssr-source', 'prerendered');

  // Store the OG-rewritten HTML (without nonce) so subsequent requests
  // only pay the cost of nonce injection.
  const toCache = new Response(ogRewritten.clone().body, {
    status: ogRewritten.status,
    statusText: ogRewritten.statusText,
    headers: (() => {
      const h = new Headers(ogHeaders);
      h.set('cache-control', `public, max-age=${OG_CACHE_TTL_SECONDS}`);
      return h;
    })(),
  });
  ctx.waitUntil(cache.put(prerenderCacheKey, toCache));

  const body = injectScriptNonce(await ogRewritten.text(), nonce);
  return new Response(body, {
    status: ogRewritten.status,
    statusText: ogRewritten.statusText,
    headers: ogHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Normalize trailing slashes — /threatintel/ and /threatintel should
    // serve the same prerendered HTML. Without this, a trailing-slash URL
    // misses the PRERENDERED_ROUTES map and falls back to the empty SPA
    // shell, which renders blank because React hasn't hydrated yet.
    // Skip normalization for the root path '/' and API routes.
    if (url.pathname.length > 1 && url.pathname.endsWith('/') && !url.pathname.startsWith('/api/')) {
      url.pathname = url.pathname.slice(0, -1);
      return Response.redirect(url.toString(), 301);
    }

    // WebSocket upgrade — route to the LiveFeed Durable Object
    if (url.pathname.startsWith('/api/v1/ws/live-feed') && request.headers.get('upgrade') === 'websocket') {
      const doId = env.LIVE_FEED_DO.idFromName('global');
      return env.LIVE_FEED_DO.get(doId).fetch(request);
    }

    // MCP server — DFIR & Threat Intel tools for AI agents
    if (url.pathname.startsWith('/api/mcp')) {
      return DfirMcpServer.serve('/api/mcp', { binding: 'DFIR_MCP' }).fetch(request, env, ctx);
    }

    // Dynamic OG image generation for blog posts and briefings.
    // Returns SVG social-preview images at the edge in <5ms.
    const ogImgMatch = /^\/api\/v1\/og-image\/(blog|briefing|research)\/(.+)$/.exec(url.pathname);
    if (ogImgMatch) {
      const type = ogImgMatch[1] as 'blog' | 'briefing' | 'research';
      const slug = ogImgMatch[2]!;

      // Try to load real data from KV/D1.
      let title = '';
      let subtitle = '';
      let date = '';
      let tags: string[] = [];

      if (type === 'blog' && env.CASE_STUDIES) {
        try {
          const post = (await env.CASE_STUDIES.get(`posts:${slug}`, 'json')) as {
            title?: string;
            excerpt?: string;
            publishedAt?: string;
          } | null;
          if (post?.title) {
            title = post.title;
            subtitle = post.excerpt?.slice(0, 160) ?? '';
            date = post.publishedAt?.slice(0, 10) ?? '';
            tags = ['Case Study', 'Blog'];
          }
        } catch {
          /* fallback below */
        }
      } else if (type === 'briefing' && env.BRIEFINGS_DB) {
        try {
          const row = await env.BRIEFINGS_DB.prepare('SELECT title, generated_at FROM briefings WHERE slug = ? LIMIT 1')
            .bind(slug)
            .first<{ title: string; generated_at: string }>();
          if (row?.title) {
            title = row.title;
            subtitle = 'CISA KEV · NVD · abuse.ch · MyThreatIntel — auto-generated threat intelligence briefing';
            date = row.generated_at?.slice(0, 10) ?? '';
            tags = ['Briefing', 'CVE', 'KEV'];
          }
        } catch {
          /* fallback below */
        }
      } else if (type === 'research') {
        // Research posts are static data — use the slug as a readable title fallback.
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        subtitle = 'Original adversary-tracking and methodology research by Pranith Jain';
        tags = ['Research', 'CTI'];
      }

      // Fallback when no data found.
      if (!title) {
        title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        subtitle = 'pranithjain.qzz.io — Threat Intelligence Platform';
      }

      return ogImageResponse({ title, subtitle, type, date: date || undefined, tags });
    }

    // Forward to the api app for the explicit /api/* prefix AND for the
    // legacy /blog/rss.xml route — the RSS handler is registered there in
    // api/src/routes/blog-public.ts but used to be unreachable because this
    // dispatcher only matched /api/*, so requests fell through to the SPA
    // shell and RSS readers saw text/html.
    if (url.pathname.startsWith('/api/') || url.pathname === '/blog/rss.xml') {
      const apiRes = await apiApp.fetch(request, env as never, ctx);
      return withSecurityHeaders(apiRes);
    }
    // Generate a fresh nonce per HTML response. The inline theme-flash
    // <script> in index.html gets `nonce="…"` injected; the CSP header
    // is built with that same nonce instead of 'unsafe-inline'.
    const nonce = generateNonce();
    const html = await fetchPrerenderedOrShell(request, env, ctx, url, nonce);
    return withSecurityHeaders(html, nonce);
  },

  /**
   * Cron-triggered work. Dispatched on cron string:
   * - "5 0 * * *"  → daily briefing for the prior calendar day
   * - "15 0 * * 1" → weekly briefing for the prior ISO week (Mon → Sun)
   * - "0 * * * *"  → warm /api/v1/snapshot + /api/v1/ioc-snapshot once
   *                  per hour. Was every 5 min — that cadence was burning
   *                  Workers KV writes for negligible UX gain. Snapshot
   *                  cache TTL bumped to 1h to match.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    const startMs = Date.now();

    // === Per-cron-string single-flight lock ============================
    // CF Workers cron is officially best-effort; in rare cases the same
    // cron string can fire twice (slow predecessor, deploy event, retry).
    // Without a lock, two concurrent hourly fires would:
    //   - rebuild the same briefing twice (wasted KEV/NVD subrequests),
    //   - post the same Telegram digest twice (visible duplicate),
    //   - double-call the case-study LLM publisher.
    // KV-backed best-effort lock with a 2-min TTL self-clears if a prior
    // run crashed before reaching the release. KV-not-bound or transient
    // KV errors → fail-open (we proceed; the prior failure modes resume,
    // which is still better than dropping the cron on the floor).
    if (env.KV_CACHE) {
      try {
        const lockKey = `cron:lock:${cron}`;
        const held = await env.KV_CACHE.get(lockKey);
        if (held) {
          console.log(JSON.stringify({ job: 'cron-lock', cron, status: 'skipped_overlap', held_since: held }));
          return;
        }
        await env.KV_CACHE.put(lockKey, new Date().toISOString(), { expirationTtl: 120 });
      } catch {
        /* KV transient — fail-open */
      }
    }

    // === Case-study generator — piggybacks on the existing 3 crons ===
    // Dispatched via ctx.waitUntil so existing briefing/warm logic below
    // runs in parallel and is not delayed by case-study work.
    const csNow = new Date(event.scheduledTime);
    const csCron = event.cron;

    // .catch on every ctx.waitUntil below: an unhandled rejection in a
    // cron job is otherwise silent (no structured log, and it can mask a
    // persistently broken discovery/planner/publisher). The briefing
    // builds further down already wrap in try/catch — match that here.
    // Log .message only — full Error objects can stringify with stack
    // frames that include upstream URLs or response snippets.
    const logCronFail = (job: string) => (e: unknown) =>
      console.error(JSON.stringify({ cron: csCron, job, error: e instanceof Error ? e.message : String(e) }));

    // One terminal log line per cron firing so operators can grep for the
    // job's lifecycle without correlating across many sub-logs.
    const logCronDone = (extra: Record<string, unknown> = {}) => {
      console.log(JSON.stringify({ job: 'cron-done', cron, duration_ms: Date.now() - startMs, ...extra }));
    };

    // Hourly cache-warm cron — also run the publisher + Telegram archive +
    // intel-bundle warmer. The warmer piggybacks here because the Cloudflare
    // free plan caps cron triggers at 5; it shares the ~50-subrequest budget
    // with the others. maxItems=1 keeps the warmer's slice (~37 subrequests)
    // bounded so the publisher/archive still complete on a typical hour.
    if (csCron === '0 * * * *') {
      ctx.waitUntil(runPublisherNow(env as unknown as CaseStudyEnv, csNow).catch(logCronFail('publisher')));
      ctx.waitUntil(runTelegramArchive(env).catch(logCronFail('telegram-archive')));
      ctx.waitUntil(
        warmIntelBundles(env as unknown as ApiEnv)
          .then((r) =>
            console.log(
              JSON.stringify({
                job: 'intel-bundle-warm',
                built: r.built.length,
                failed: r.failed.length,
                has_more: r.hasMore,
                slugs: r.built,
                llm_ran: r.llmRan,
                llm_partial: r.llmPartial,
              })
            )
          )
          .catch(logCronFail('intel-bundle-warm'))
      );
    }

    // Case-study discovery — its OWN invocation (no longer shares the
    // subrequest budget with the briefing build, which used to degrade it).
    if (csCron === '5 0 * * *') {
      ctx.waitUntil(
        runDiscoveryNow(env as unknown as CaseStudyEnv, csNow)
          .catch(logCronFail('discovery'))
          .finally(() => logCronDone({ path: 'discovery' }))
      );
      return;
    }

    // Case-study planner — its own invocation.
    if (csCron === '15 0 * * 1') {
      ctx.waitUntil(
        runPlannerNow(env as unknown as CaseStudyEnv, csNow)
          .catch(logCronFail('planner'))
          .finally(() => logCronDone({ path: 'planner' }))
      );
      return;
    }

    if (cron === '0 * * * *') {
      // Self-heal: Cloudflare crons are best-effort and the 00:05 UTC daily
      // build can miss (silent failure, CPU limit, or a missed firing).
      // Once per hour, check whether the expected daily briefing exists; if
      // not, build it. Skip at UTC hour 0 — the daily cron is 5 minutes away
      // and will produce a fresher version. Independent from the warm work
      // below so a slow build can't delay snapshot warming.
      // ONE sequential task. The hourly invocation shares a ~50-subrequest
      // budget across EVERY ctx.waitUntil in it. The briefing catch-up used
      // to run CONCURRENTLY with the 12-handler snapshot warm (each handler
      // fans out to many upstreams) — the warm's fan-out exhausted the
      // budget and the catch-up's KEV/NVD fetches threw "Too many
      // subrequests", producing the persistent "both unreachable" empty
      // briefing. (A standalone /api/v1/cve-recent works precisely because
      // it gets its own fresh budget.) Now: run the catch-up FIRST and
      // alone; if a rebuild was needed this hour, SKIP the warm entirely —
      // it self-corrects next hour once the briefing is healthy.
      ctx.waitUntil(
        (async () => {
          const db = env.BRIEFINGS_DB as D1Database | undefined;
          let rebuiltThisHour = false;

          const isRich = (statsJson: string | undefined): boolean => {
            try {
              const s = JSON.parse(statsJson || '{}') as { findings?: number; iocs?: number };
              return (s.findings ?? 0) > 0 || (s.iocs ?? 0) > 0;
            } catch {
              return false;
            }
          };
          // Rebuild when the row is missing OR empty (an empty/clobbered
          // briefing must self-heal). writeBriefing's own guard still
          // prevents a transient empty rebuild from clobbering a rich row.
          const healOne = async (type: 'daily' | 'weekly', slug: string) => {
            if (!db) return;
            const row = await db
              .prepare('SELECT stats_json FROM briefings WHERE slug = ?')
              .bind(slug)
              .first<{ stats_json: string }>();
            if (row && isRich(row.stats_json)) return;
            // A rebuild is NEEDED — claim the invocation's subrequest budget
            // for it (skip the warm) whether or not the build then succeeds.
            rebuiltThisHour = true;
            try {
              const briefing = await buildBriefing(type, undefined, {
                nvdApiKey: env.NVD_API_KEY,
                env: env as unknown as ApiEnv,
              });
              const result = await writeBriefing(db, briefing);
              if (result.written) {
                console.log(
                  `scheduled(${type}-catch-up): wrote ${briefing.slug} (findings=${briefing.stats.findings}, iocs=${briefing.stats.iocs})`
                );
              }
            } catch (err) {
              // .message only — Error objects can stringify upstream
              // response context (rare, but cheap to defend against).
              console.error(
                JSON.stringify({
                  job: `scheduled(${type}-catch-up)`,
                  status: 'build_failed',
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            }
          };

          // Daily: skip UTC hour 0 — the 00:30 dedicated cron is imminent.
          if (db && new Date().getUTCHours() !== 0) {
            const yesterday = new Date(Date.now() - 86400_000);
            await healOne('daily', `daily-${yesterday.toISOString().slice(0, 10)}`);
          }
          // Weekly self-heal once/day at UTC hour 2 (weekly cron only fires
          // Mondays, so a failed weekly was otherwise stuck a full week).
          if (db && new Date().getUTCHours() === 2) {
            await healOne('weekly', expectedWeeklySlug());
          }

          if (rebuiltThisHour) {
            console.log('scheduled: skipped snapshot warm this hour — briefing catch-up took the subrequest budget');
            return;
          }

          // No rebuild needed → warm caches with the full budget. Warm the
          // per-source handlers first (the snapshot composers read their
          // caches), then the composers. Two parallel waves.
          const start = Date.now();
          const baseUrl = 'https://pranithjain.qzz.io';
          const perSourceTargets = [
            '/api/v1/threat-map',
            '/api/v1/rules',
            '/api/v1/ransomware-recent',
            '/api/v1/telegram-feed',
            '/api/v1/onion-watch',
            '/api/v1/cve-recent',
            '/api/v1/phishing-urls',
            '/api/v1/malware-samples',
            '/api/v1/reddit-feed',
            '/api/v1/x-feed',
            '/api/v1/detections',
            '/api/v1/maltiverse/search?q=ransomware',
            '/api/v1/certspotter/search?domain=example.com',
          ];
          const composerTargets = ['/api/v1/snapshot', '/api/v1/ioc-snapshot'];
          async function warm(path: string) {
            const req = new Request(baseUrl + path, { method: 'GET' });
            const res = await apiApp.fetch(req, env as never, ctx);
            await res.arrayBuffer();
            return { path, status: res.status };
          }
          const perSource = await Promise.allSettled(perSourceTargets.map(warm));
          const composers = await Promise.allSettled(composerTargets.map(warm));
          const summary = [...perSource, ...composers]
            .map((r, i) => {
              const path = [...perSourceTargets, ...composerTargets][i];
              return r.status === 'fulfilled'
                ? `${r.value.path}=${r.value.status}`
                : `${path}=err(${(r.reason as Error).message})`;
            })
            .join(' ');
          console.log(`scheduled: warmed in ${Date.now() - start}ms — ${summary}`);

          // === Watch engine — check watched entities against fresh caches ===
          try {
            const watchAlerts = await checkWatches(env.KV_CACHE as unknown as KVNamespace, new Date().toISOString());
            if (watchAlerts.length > 0) {
              console.log(
                JSON.stringify({
                  job: 'watch-engine',
                  triggered: watchAlerts.length,
                  alerts: watchAlerts.map((a) => ({ label: a.label, type: a.type, match: a.match })),
                })
              );
            }
          } catch (e) {
            console.error(JSON.stringify({ job: 'watch-engine', error: e instanceof Error ? e.message : String(e) }));
          }

          // === Daily blocklist build (6am UTC) ==================================
          if (new Date().getUTCHours() === 6) {
            try {
              const bl = await buildBlocklists(env.KV_CACHE);
              console.log(
                JSON.stringify({
                  job: 'blocklist-build',
                  ip_count: bl.ip_count,
                  generated_at: bl.generated_at,
                  pfsense_bytes: bl.pfsense.length,
                  iptables_bytes: bl.iptables.length,
                  suricata_bytes: bl.suricata.length,
                })
              );
            } catch (e) {
              console.error(
                JSON.stringify({
                  job: 'blocklist-build',
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                })
              );
            }
          }
        })().catch(logCronFail('hourly-cron'))
        // Without this .catch, an unhandled rejection inside the IIFE
        // (briefing build, warm) silently aborts the entire ctx.waitUntil
        // task — no log, no recovery. logCronFail emits a structured
        // line so the operator at least sees that the hourly broke.
      );
      ctx.waitUntil(Promise.resolve().then(() => logCronDone({ path: 'hourly' })));
      return;
    }

    // === NEXT CRON BLOCK ==================================

    // Dedicated briefings cron path — ONLY the two briefing-only crons reach
    // here (discovery/planner returned above; hourly returned in its block).
    // Each runs alone with a full subrequest budget.
    if (cron !== '30 0 * * *' && cron !== '45 0 * * 1') return;
    if (!env.BRIEFINGS_DB) {
      console.warn('scheduled: BRIEFINGS_DB not bound, skipping');
      return;
    }
    const isWeekly = cron === '45 0 * * 1';
    const type = isWeekly ? 'weekly' : 'daily';

    ctx.waitUntil(
      (async () => {
        const db = env.BRIEFINGS_DB as D1Database;
        try {
          const briefing = await buildBriefing(type, undefined, {
            nvdApiKey: env.NVD_API_KEY,
            env: env as unknown as ApiEnv,
          });
          await writeBriefing(db, briefing);
          console.log(
            `scheduled: wrote ${briefing.slug} (findings=${briefing.stats.findings}, iocs=${briefing.stats.iocs})`
          );
        } catch (err) {
          console.error(
            JSON.stringify({
              job: 'briefing-build',
              type,
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            })
          );
        }
        // Always run the sweep, even if the build failed — keeps DB tidy.
        try {
          const result = await sweepOldBriefings(db, BRIEFING_MAX_AGE_DAYS);
          if (result.deleted.length > 0) {
            console.log(
              `scheduled: swept ${result.deleted.length} old briefings (${result.deleted.join(', ')}); kept ${result.kept}`
            );
          }
        } catch (err) {
          console.error(
            JSON.stringify({
              job: 'briefing-sweep',
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            })
          );
        }
        logCronDone({ path: 'briefing-dedicated', type });
      })().catch(logCronFail('briefing-dedicated'))
    );
  },
};
