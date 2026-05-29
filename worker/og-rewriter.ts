import { injectScriptNonce } from './csp';
import type { Env } from './env';

/**
 * Per-route social metadata overrides. The SPA serves the same index.html
 * for every path, so without rewriting the OG tags at the edge, any social-
 * media bot that fetches `/threatintel/correlation` sees the portfolio-root
 * meta and routes preview-clicks back to `/`.
 *
 * Lookup is exact-match first, then longest-matching prefix (so
 * `/threatintel/anything-else` still inherits the `/threatintel` card).
 */
export interface OgOverride {
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

/** The one true public origin. Used for canonical/OG URLs so they can never
 *  be poisoned by a request arriving on a non-canonical host. */
const CANONICAL_ORIGIN = 'https://pranithjain.qzz.io';

const OG_OVERRIDES: Record<string, OgOverride> = {
  '/about': {
    title: 'About · Pranith Jain',
    description:
      'Security engineer working across DFIR, threat intelligence, detection engineering, and cloud security. Background, focus areas, and how to get in touch.',
  },
  '/skills': {
    title: 'Skills · Pranith Jain',
    description:
      'Capabilities across digital forensics & incident response, threat intelligence, detection engineering, cloud & application security, and security automation.',
  },
  '/experience': {
    title: 'Experience · Pranith Jain',
    description: 'Professional experience and roles in security engineering, DFIR, and threat intelligence.',
  },
  '/projects': {
    title: 'Projects · Pranith Jain',
    description:
      'Selected security projects and case studies — detection tooling, threat-intel platforms, and DFIR utilities built and shipped on the edge.',
  },
  '/blog': {
    title: 'Blog · Pranith Jain',
    description:
      'Writing on threat intelligence, detection engineering, DFIR, and cloud security — field notes, deep dives, and analysis.',
  },
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
};

function findOgOverride(pathname: string): OgOverride | null {
  const matches: Array<{ key: string; value: OgOverride }> = [];
  for (const [k, v] of Object.entries(OG_OVERRIDES)) {
    if (k === pathname || pathname.startsWith(`${k}/`)) {
      matches.push({ key: k, value: v });
    }
  }
  if (matches.length === 0) return null;

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
 *
 * Also injects the CSP nonce into the inline <script> tag when provided.
 * Combining both passes avoids a second full-String copy of the HTML body
 * (the caller used to read body → OG rewrite → Response → read body again
 * for nonce injection, doubling memory traffic on every HTML response).
 */
function rewriteHtml(html: string, override: OgOverride | null, fullUrl: string, nonce?: string): string {
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
  if (nonce) {
    out = out.replace(/<script>/g, `<script nonce="${nonce}">`);
  }
  return out;
}

/**
 * Resolve per-route OG title/description: static map first, then a live
 * lookup for blog posts so a shared /blog/<slug> shows the POST's title and
 * excerpt (not the generic blog card). Returns null when there's no
 * meaningful override — the URL/canonical still get corrected regardless.
 */
export async function resolveOg(url: URL, env: Env): Promise<OgOverride | null> {
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

export const OG_CACHE_TTL_SECONDS = 86_400;

/**
 * Mutate the static index.html so the OG / Twitter / canonical metadata
 * reflects the actual route. Only kicks in for HTML responses (asset router
 * returns text/html for SPA fallback paths). Anything else passes through.
 */
export async function injectOgMeta(
  response: Response,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  nonce?: string
): Promise<Response> {
  const etag = nonce ? (response.headers.get('etag') ?? response.headers.get('last-modified') ?? '') : '';
  if (etag) {
    const cacheKey = new Request(
      `https://og-html.internal/v2/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
    );
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const body = injectScriptNonce(await cached.text(), nonce);
      return new Response(body, {
        headers: {
          'content-type': cached.headers.get('content-type') ?? 'text/html;charset=UTF-8',
        },
      });
    }
  }

  const html = await response.text();
  const ogOverride = await resolveOg(url, env);
  const ogRewritten = rewriteHtml(html, ogOverride, `${CANONICAL_ORIGIN}${url.pathname}${url.search}`);
  const final = nonce ? injectScriptNonce(ogRewritten, nonce) : ogRewritten;

  const result = new Response(final, {
    headers: {
      'content-type': response.headers.get('content-type') ?? 'text/html;charset=UTF-8',
    },
  });

  if (etag) {
    const toCache = new Response(ogRewritten, {
      headers: {
        'content-type': response.headers.get('content-type') ?? 'text/html;charset=UTF-8',
        'cache-control': `public, max-age=${OG_CACHE_TTL_SECONDS}`,
      },
    });
    const ck = new Request(
      `https://og-html.internal/v2/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
    );
    ctx.waitUntil(caches.default.put(ck, toCache).catch(() => {}));
  }

  return result;
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
export async function getOrInjectOg(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const assetRes = await env.ASSETS.fetch(request);
  const ct = assetRes.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('text/html')) return assetRes;

  const etag = assetRes.headers.get('etag') ?? assetRes.headers.get('last-modified') ?? 'unversioned';
  const cache = caches.default;
  const REWRITE_VERSION = 'v2';
  const cacheKey = new Request(
    `https://og-html.internal/${REWRITE_VERSION}/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const withOg = await injectOgMeta(assetRes, url, env, ctx);
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
