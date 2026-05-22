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
import type { Env as ApiEnv } from '../api/src/env';
import type { Ai, D1Database } from '@cloudflare/workers-types';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  CASE_STUDIES: KVNamespace;
  AI: Ai;
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
}

/** The one true public origin. Used for canonical/OG URLs so they can never
 *  be poisoned by a request arriving on a non-canonical host. */
const CANONICAL_ORIGIN = 'https://pranithjain.qzz.io';

/**
 * Build the CSP value. When `nonce` is provided (HTML responses only),
 * `script-src` switches from the legacy `'unsafe-inline'` to nonce-based
 * — the one inline `<script>` in index.html (the theme-flash preventer)
 * gets a matching `nonce` attribute injected, and every other inline
 * script (i.e. anything an attacker manages to inject) is blocked.
 *
 * `style-src 'unsafe-inline'` is retained because React components ship
 * inline `style={...}` attributes throughout the SPA — removing it would
 * require a much bigger refactor (CSS-in-JS extraction, no inline style
 * props) than the threat warrants given XSS is multi-layer-blocked
 * (server regex sanitiser → client DOMPurify → blocked by script-src).
 */
function cspHeader(nonce?: string): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://static.cloudflareinsights.com`
    : // API responses don't carry scripts, so the static value stays safe.
      // The 'unsafe-inline' remains here purely as a no-op fallback — there
      // is no <script> in JSON responses for an attacker to attach to.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const STATIC_SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  server: 'PranithJain',
};

function withSecurityHeaders(response: Response, nonce?: string): Response {
  const headers = new Headers(response.headers);
  // CSP is ALWAYS set (not "set if missing") — the nonce changes per
  // response, so a static value from `public/_headers` or an asset
  // pipeline must be replaced, not preserved. If any earlier layer set
  // a CSP, it's now overwritten by the per-response version here.
  headers.set('content-security-policy', cspHeader(nonce));
  for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Generate a CSP nonce. 128 random bits → base64url-encoded (≈22 chars).
 * Workers exposes the Web Crypto API natively; no Node polyfills needed.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Inline base64url so we don't depend on `Buffer` or polyfills.
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Inject `nonce="…"` into the one inline `<script>` in our index.html
 * (the theme-flash preventer). External scripts (`<script type="module"
 * crossorigin src="…">`) don't need a nonce — they're covered by
 * `script-src 'self'`. Matching `<script>` with no attributes scopes
 * the rewrite to the inline tag only. Idempotent (the cache stores the
 * nonce-less HTML; this runs per request).
 */
function injectScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script>/g, `<script nonce="${nonce}">`);
}

/**
 * Per-route social metadata overrides. The SPA serves the same index.html
 * for every path, so without rewriting the OG tags at the edge, any social-
 * media bot that fetches `/threatintel/correlation` sees the portfolio-root
 * meta and routes preview-clicks back to `/`.
 *
 * Lookup is exact-match first, then longest-matching prefix (so
 * `/threatintel/anything-else` still inherits the `/threatintel` card).
 */
interface OgOverride {
  title: string;
  description: string;
  /**
   * Optional per-surface OG image. When set, the worker rewrites
   * `og:image` + `twitter:image` to this URL so a share-preview of
   * /threatintel renders the CTI card, /dfir renders the toolkit card,
   * and everything else falls back to the portfolio default in
   * index.html. Use a relative path; the worker joins it with the
   * canonical origin.
   */
  image?: string;
}

const OG_OVERRIDES: Record<string, OgOverride> = {
  '/threatintel': {
    title: 'Threat Intel Platform · pranithjain.qzz.io',
    description:
      'A working CTI surface on the edge. Live ransomware leak claims, CVE merged with CISA KEV, cross-source IOC correlation across 18 feeds, an actor-activity Gantt joined with MITRE Group profiles, victim re-leak detection, ten-panel metrics, STIX 2.1 export, and a writeups aggregator across 18 analyst blogs.',
    image: '/og-threatintel.png',
  },
  '/threatintel/external-resources': {
    title: 'External Resources Catalog · pranithjain.qzz.io',
    description:
      'Off-site cross-references for threat-intel work — dashboards (My Threat Intel, World Monitor), OSINT directories, training labs (AI Goat, WebVerse, VulnOS), malware samples, and AI-security research. Filterable by kind, searchable by name/description.',
  },
  '/threatintel/correlation': {
    title: 'Cross-source IOC correlation · pranithjain.qzz.io',
    description:
      'Indicators that appear in 2+ independent IOC feeds, ranked by source consensus. Single-feed flags can be false positives; cross-source overlap is the signal analysts trust. 18 feeds aggregated.',
  },
  '/threatintel/live-iocs': {
    title: 'Live IOC stream · pranithjain.qzz.io',
    description:
      'Chronological firehose of individual indicators. Each entry carries a reporter handle, source feed, and first-observed timestamp. 10 sources including TweetFeed, SANS ISC, C2IntelFeeds, URLhaus, ThreatFox.',
  },
  '/threatintel/detections': {
    title: 'Detections · pranithjain.qzz.io',
    description:
      'A curated detection-rule pack evaluated hourly against the unified live-IOC stream. Cross-feed consensus, Cobalt Strike / C2, ransomware and infostealer tagging, and phishing-campaign clustering — each firing rule shown with the indicators that triggered it.',
  },
  '/dfir/detection-lab': {
    title: 'Detection Lab · pranithjain.qzz.io',
    description:
      'Write a detection rule in a small JSON DSL and evaluate it in your browser against the live multi-feed IOC stream. Cross-feed consensus, value/context/source predicates, save and export — the same engine that powers /threatintel/detections.',
  },
  '/dfir/rule-converter': {
    title: 'Rule Converter · pranithjain.qzz.io',
    description:
      'Universal heuristic detection-rule translation — any format to any other. Sigma, Microsoft KQL, Splunk SPL, Elastic Lucene & EQL, YARA, DLP regex, and a supply-chain Semgrep scaffold, each both source and target via one intermediate representation. Every lossy step flagged. 100% client-side.',
  },
  '/threatintel/actor-timeline': {
    title: 'Ransomware actor activity timeline · pranithjain.qzz.io',
    description:
      'Per-actor leak-site cadence across the last 30 days, joined with curated MITRE ATT&CK Group references. Pivot from "who is posting" to "what TTPs to hunt for."',
  },
  '/threatintel/re-leaks': {
    title: 'Victim re-leak detection · pranithjain.qzz.io',
    description:
      'Victims claimed by 2+ ransomware groups in the last 12 months. Usually a failed double-extortion or an affiliate moving programs.',
  },
  '/threatintel/metrics': {
    title: 'Threat Intel Metrics · pranithjain.qzz.io',
    description:
      'Ten panels answering the questions a CTI team actually asks. Most-active ransomware groups, CVE severity, KEV cadence, top-impersonated brands, IOC volume by source, sector targeting, malware families, re-leak hotspots.',
  },
  '/threatintel/writeups': {
    title: 'CTI writeups feed · pranithjain.qzz.io',
    description:
      'Live aggregation of long-form CTI writeups from 18 analyst blogs and vendor research labs: The DFIR Report, BushidoToken, DoublePulsar, Krebs, SentinelLabs, Unit 42, Check Point Research, Huntress, and more.',
  },
  '/threatintel/research': {
    title: 'Threat-intel research · pranithjain.qzz.io',
    description:
      "Original adversary-tracking and methodology pieces written by Pranith Jain. Every quantitative claim sourced to this platform's own aggregated feeds or to named third-party reporting.",
  },
  '/threatintel/cve-list': {
    title: 'Live CVE updates · pranithjain.qzz.io',
    description:
      'NVD published-CVE feed merged with the CISA KEV catalogue. Severity, KEV flag, ransomware-use flag, and a curated actor pill where attribution exists.',
  },
  '/threatintel/status': {
    title: 'Feed status · pranithjain.qzz.io',
    description: 'Health of every upstream-backed feed on the threat-intel platform.',
  },
  '/dfir': {
    title: 'DFIR Toolkit · pranithjain.qzz.io',
    description:
      'Interactive DFIR tools on the edge. IOC checker streaming verdicts from 24 providers, Diamond Model builder with auto-fill, STIX 2.1 viewer, subdomain-takeover fingerprinting, MITRE ATT&CK matrix, and a long tail of analyst utilities. Free, no signup.',
    image: '/og-dfir.png',
  },
  '/dfir/ioc-check': {
    title: 'IOC Checker · pranithjain.qzz.io',
    description:
      'Paste any IP, domain, URL, hash, or CVE. Get streaming verdicts from VirusTotal, AbuseIPDB, OTX, GreyNoise, the abuse.ch trio, and a long tail of free reputation lists.',
  },
  '/dfir/diamond': {
    title: 'Diamond Model auto-fill · pranithjain.qzz.io',
    description:
      'Build an intrusion-event Diamond Model. Paste any IOC or actor name and the four corners auto-populate from IOC checker, ip-geo, cross-source correlation, KEV-actor mapping, MalwareBazaar, and ransomware-victim cross-match.',
  },
  '/about': {
    title: 'About · Pranith Jain',
    description:
      'Security analyst and detection engineer. Phishing, BEC, and malware incidents at human scale; defenders built at AI scale. 250+ incidents, 1300+ domains secured, 75-minute mean response time.',
  },
  '/projects': {
    title: 'Projects · Pranith Jain',
    description:
      'A working CTI platform, a DFIR toolkit, a CTI STIX connector, email-infrastructure automation across 1,300+ domains, and a handful of older capstones.',
  },
  '/skills': {
    title: 'Skills · Pranith Jain',
    description:
      'Email security and deliverability, threat intelligence, cyber criminology and OSINT, email threat response, cloud identity security, and AI for security automation.',
  },
  '/experience': {
    title: 'Experience · Pranith Jain',
    description:
      'Security Analyst at Qubit Capital, Tech Associate at UnifyCX, and earlier engineering roles. Email security operations, infrastructure monitoring, phishing and BEC investigation, SOC automation, and domain-abuse monitoring.',
  },
  '/blog': {
    title: 'Blog · Pranith Jain',
    description:
      'Security case studies — CVE & CISA-KEV breakdowns, ransomware activity, threat-actor TTPs, malware and breach analysis. Auto-generated from live threat-intel feeds.',
  },
};

/**
 * Resolve a path to an OgOverride by merging every matching entry in
 * OG_OVERRIDES — exact match plus all prefix matches — with longer (more
 * specific) keys winning per field, AND missing fields inheriting from
 * shorter (less specific) parent keys.
 *
 * Why merge instead of pick-most-specific: image inheritance. The
 * /threatintel/correlation override carries a route-specific title and
 * description, but no image. The previous lookup returned just that
 * override, which meant `image` was undefined and the worker fell back
 * to the build-time portfolio default. Now /threatintel's image inherits
 * down to /threatintel/correlation while correlation's title still wins.
 *
 * Returns null only when neither an exact match nor any prefix match
 * exists for the path.
 */
function findOgOverride(pathname: string): OgOverride | null {
  const matches: Array<{ key: string; value: OgOverride }> = [];
  for (const [k, v] of Object.entries(OG_OVERRIDES)) {
    if (k === pathname || pathname.startsWith(`${k}/`)) {
      matches.push({ key: k, value: v });
    }
  }
  if (matches.length === 0) return null;

  // Ascending by key length so the merge walks shortest-prefix first,
  // letting longer (more specific) keys overwrite parent fields. Exact
  // match (longest possible) ends up last and wins on every defined
  // field while leaving its undefined fields untouched.
  matches.sort((a, b) => a.key.length - b.key.length);

  let merged: OgOverride = { title: '', description: '' };
  for (const { value } of matches) {
    merged = {
      title: value.title || merged.title,
      description: value.description || merged.description,
      image: value.image ?? merged.image,
    };
  }
  return merged;
}

const HTML_ATTR_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ATTR_ESCAPE[c] ?? c);
}

/**
 * Always corrects the canonical URL + og:url + twitter:url to the actual
 * requested page. Without this, EVERY non-overridden deep link (notably
 * /blog/:slug) was served index.html's build-time og:url/canonical pointing
 * at the site root — so LinkedIn/Twitter resolved a shared blog link to the
 * HOME page and showed the home card. Title/description are additionally
 * rewritten only when we have a route- or post-specific override.
 */
function rewriteOgMeta(html: string, override: OgOverride | null, fullUrl: string): string {
  const u = escapeAttr(fullUrl);
  let out = html
    .replace(/<link rel="canonical" href="[^"]*"/i, `<link rel="canonical" href="${u}"`)
    .replace(/<meta property="og:url" content="[^"]*"/i, `<meta property="og:url" content="${u}"`)
    .replace(/<meta name="twitter:url" content="[^"]*"/i, `<meta name="twitter:url" content="${u}"`);
  if (override) {
    const t = escapeAttr(override.title);
    const d = escapeAttr(override.description);
    out = out
      .replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`)
      .replace(/<meta name="description" content="[^"]*"/i, `<meta name="description" content="${d}"`)
      .replace(/<meta property="og:title" content="[^"]*"/i, `<meta property="og:title" content="${t}"`)
      .replace(/<meta property="og:description" content="[^"]*"/i, `<meta property="og:description" content="${d}"`)
      .replace(/<meta name="twitter:title" content="[^"]*"/i, `<meta name="twitter:title" content="${t}"`)
      .replace(/<meta name="twitter:description" content="[^"]*"/i, `<meta name="twitter:description" content="${d}"`);

    // Per-route OG image. Swap `og:image` and `twitter:image` to the
    // override's image. Path is joined with the canonical origin so
    // social-media bots receive an absolute URL (relative og:image
    // values break on LinkedIn and Slack regardless of base/canonical).
    if (override.image) {
      const imgUrl = `${CANONICAL_ORIGIN}${override.image}`;
      const imgAttr = escapeAttr(imgUrl);
      out = out
        .replace(/<meta property="og:image" content="[^"]*"/i, `<meta property="og:image" content="${imgAttr}"`)
        .replace(
          /<meta property="twitter:image" content="[^"]*"/i,
          `<meta property="twitter:image" content="${imgAttr}"`
        );
    }
  }
  return out;
}

/**
 * Resolve per-route OG title/description: static map first, then a live
 * lookup for blog posts so a shared /blog/<slug> shows the POST's title and
 * excerpt (not the generic blog card). Returns null when there's no
 * meaningful override — the URL/canonical still get corrected regardless.
 */
async function resolveOg(url: URL, env: Env): Promise<OgOverride | null> {
  // Blog POST first — must run before findOgOverride, which prefix-matches
  // `/blog` for `/blog/<slug>` and would otherwise shadow the per-post card.
  const m = /^\/blog\/([a-z0-9-]{1,200})$/.exec(url.pathname);
  if (m && env.CASE_STUDIES) {
    try {
      const post = (await env.CASE_STUDIES.get(`posts:${m[1]}`, 'json')) as {
        title?: string;
        excerpt?: string;
      } | null;
      if (post?.title) {
        return {
          title: `${post.title} · Pranith Jain`,
          description: post.excerpt?.slice(0, 280) || OG_OVERRIDES['/blog']!.description,
        };
      }
    } catch {
      /* fall through to the generic blog card */
    }
    return OG_OVERRIDES['/blog'] ?? null;
  }
  return findOgOverride(url.pathname);
}

/**
 * Mutate the static index.html so the OG / Twitter / canonical metadata
 * reflects the actual route. Only kicks in for HTML responses (asset router
 * returns text/html for SPA fallback paths). Anything else passes through.
 */
async function injectOgMeta(response: Response, url: URL, env: Env): Promise<Response> {
  const ct = response.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('text/html')) return response;
  const override = await resolveOg(url, env);
  // Canonical origin is fixed, never derived from the request. Deriving it
  // from url.origin let a non-canonical host (alias / smuggled Host) poison
  // the cached canonical + og:url served to everyone on that path. Note:
  // rewrite ALWAYS runs (even with no title/desc override) so og:url +
  // canonical point at THIS page — that's the blog-share-to-home fix.
  const fullUrl = `${CANONICAL_ORIGIN}${url.pathname}`;
  const html = await response.text();
  const rewritten = rewriteOgMeta(html, override, fullUrl);
  const headers = new Headers(response.headers);
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Cache the OG-rewritten HTML in the Cache API, keyed by `pathname @ etag`.
 *
 * Why the etag matters: a redeploy bumps Vite's chunk hashes inside index.html,
 * so the rewritten HTML now references new <script src> filenames. The OLD
 * filenames are deleted from the assets binding on deploy. If we cached only
 * by pathname, users would hit stale HTML referencing deleted bundles and
 * get 404s on the chunk fetch for up to TTL.
 *
 * The asset binding's etag is content-derived, so on every redeploy the
 * underlying index.html gets a new etag → new cache key → cold rewrite →
 * cached version always matches the assets currently on disk. That makes
 * it safe to use a much longer TTL than the 10 min we'd need without the
 * etag suffix; 1d gives us very high hit rate with zero staleness risk.
 */
const OG_CACHE_TTL_SECONDS = 86_400;

async function getOrInjectOg(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  // Runs for EVERY SPA HTML route now (not just OG_OVERRIDES ones): even
  // with no title/desc override we must correct og:url + canonical so a
  // shared deep link (blog post etc.) resolves to that page, not home.

  // Asset fetch is required up-front because the cache key depends on the
  // etag of the underlying asset. This is cheap — env.ASSETS.fetch is a
  // local-edge lookup, and on cache hit we never read the body (no
  // .text() call) so the bytes don't move.
  const assetRes = await env.ASSETS.fetch(request);
  const ct = assetRes.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('text/html')) return assetRes;

  const etag = assetRes.headers.get('etag') ?? assetRes.headers.get('last-modified') ?? 'unversioned';
  const cache = caches.default;
  // Key includes the request host: the rewritten HTML is host-independent
  // now (canonical is constant), but keying by host as well as path@etag
  // keeps a non-canonical host's responses from ever sharing an entry.
  // Cache-key version. Bumped whenever the OG rewrite logic changes
  // (rewriteOgMeta, findOgOverride, OG_OVERRIDES image inheritance,
  // etc.) so a deploy busts cached entries even though the asset
  // etag didn't change — the asset is the unchanged index.html shell,
  // but the rewrite *of* that shell is what we're actually caching.
  //   v1 (implicit): original title/description rewrite
  //   v2: image swap added; sub-route image inheritance via merged
  //       OG_OVERRIDES lookup
  const REWRITE_VERSION = 'v2';
  const cacheKey = new Request(
    `https://og-html.internal/${REWRITE_VERSION}/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const withOg = await injectOgMeta(assetRes, url, env);
  const toCache = new Response(withOg.clone().body, {
    status: withOg.status,
    statusText: withOg.statusText,
    headers: (() => {
      const h = new Headers(withOg.headers);
      h.set('cache-control', `public, max-age=${OG_CACHE_TTL_SECONDS}`);
      return h;
    })(),
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return withOg;
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
  // Portfolio
  ['/', '/__prerendered/home'],
  ['/about', '/__prerendered/about'],
  ['/skills', '/__prerendered/skills'],
  ['/experience', '/__prerendered/experience'],
  ['/projects', '/__prerendered/projects'],
  // Landings
  ['/dfir', '/__prerendered/dfir'],
  ['/threatintel', '/__prerendered/threatintel'],
  // Catalogs / education
  ['/threatintel/wiki', '/__prerendered/threatintel__wiki'],
  ['/threatintel/awesome-lists', '/__prerendered/threatintel__awesome-lists'],
  ['/threatintel/secops-tools', '/__prerendered/threatintel__secops-tools'],
  ['/threatintel/cve-resources', '/__prerendered/threatintel__cve-resources'],
  ['/threatintel/osint-framework', '/__prerendered/threatintel__osint-framework'],
  ['/dfir/diamond', '/__prerendered/dfir__diamond'],
  ['/dfir/owasp', '/__prerendered/dfir__owasp'],
  ['/dfir/lolbins', '/__prerendered/dfir__lolbins'],
  // Frameworks / training
  ['/dfir/kill-chain', '/__prerendered/dfir__kill-chain'],
  ['/dfir/tabletop', '/__prerendered/dfir__tabletop'],
  ['/dfir/grc', '/__prerendered/dfir__grc'],
  ['/dfir/data-classification', '/__prerendered/dfir__data-classification'],
  ['/dfir/privacy-hub', '/__prerendered/dfir__privacy-hub'],
  // Live-feed surfaces — prerendered chrome + loading state (Phase 3.1)
  ['/threatintel/threat-feeds', '/__prerendered/threatintel__threat-feeds'],
  ['/threatintel/writeups', '/__prerendered/threatintel__writeups'],
  ['/threatintel/cyber-crime', '/__prerendered/threatintel__cyber-crime'],
  ['/threatintel/ransomware-activity', '/__prerendered/threatintel__ransomware-activity'],
  ['/threatintel/live-iocs', '/__prerendered/threatintel__live-iocs'],
  ['/threatintel/detections', '/__prerendered/threatintel__detections'],
]);

async function fetchPrerenderedOrShell(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  nonce: string
): Promise<Response> {
  const prerenderedPath = PRERENDERED_ROUTES.get(url.pathname);
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
  const ogRewritten = await injectOgMeta(prerenderRes, url, env);
  const headers = new Headers(ogRewritten.headers);
  headers.set('cache-control', `public, max-age=${OG_CACHE_TTL_SECONDS}`);
  headers.set('x-ssr-source', 'prerendered');
  const body = injectScriptNonce(await ogRewritten.text(), nonce);
  return new Response(body, {
    status: ogRewritten.status,
    statusText: ogRewritten.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
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

    // Hourly cache-warm cron — also run the publisher + Telegram archive.
    if (csCron === '0 * * * *') {
      ctx.waitUntil(runPublisherNow(env as unknown as CaseStudyEnv, csNow).catch(logCronFail('publisher')));
      ctx.waitUntil(runTelegramArchive(env).catch(logCronFail('telegram-archive')));
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

    // Intel-bundle warmer — its OWN invocation (own ~50-subrequest budget).
    // Each pipeline run burns ~37 subrequests (35 fresh provider lookups +
    // KEV + EPSS) so processing more than one briefing per firing would
    // blow the budget. Hourly cadence × 1 item ≫ 1–2 briefings/day; the
    // helper backfills oldest-first so a missed firing is recovered next
    // hour. Skipping all other branches: a missed cron-warm is cheap and
    // self-healing; sharing the budget with publisher/archive would
    // sometimes starve one of them.
    if (csCron === '7 * * * *') {
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
          .finally(() => logCronDone({ path: 'intel-bundle-warm' }))
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
        })().catch(logCronFail('hourly-cron'))
        // Without this .catch, an unhandled rejection inside the IIFE
        // (briefing build, warm) silently aborts the entire ctx.waitUntil
        // task — no log, no recovery. logCronFail emits a structured
        // line so the operator at least sees that the hourly broke.
      );
      ctx.waitUntil(Promise.resolve().then(() => logCronDone({ path: 'hourly' })));
      return;
    }

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
