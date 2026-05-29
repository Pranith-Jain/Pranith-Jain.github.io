/**
 * OG (Open Graph) metadata rewriting for social-media previews.
 *
 * The SPA serves the same index.html for every route, so without
 * rewriting OG tags at the edge, every shared link shows the portfolio
 * default card. This module:
 *   1. Defines per-route title/description/image overrides.
 *   2. Rewrites OG meta tags + canonical URL per request.
 *   3. Caches the rewritten HTML in the Cache API (keyed by pathname@etag)
 *      so rewrites happen once per deploy, not once per request.
 */

import type { Env } from '../api/src/env';

/** The one true public origin. */
export const CANONICAL_ORIGIN = 'https://pranithjain.qzz.io';

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

export const OG_OVERRIDES: Record<string, OgOverride> = {
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
 * Returns null only when neither an exact match nor any prefix match
 * exists for the path.
 */
export function findOgOverride(pathname: string): OgOverride | null {
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
 * requested page. Title/description are additionally rewritten only when
 * we have a route- or post-specific override.
 */
export function rewriteOgMeta(html: string, override: OgOverride | null, fullUrl: string): string {
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
        )
        // Remove stale image dimension/type meta from the old static image
        // (e.g. og:image:type="image/png", og:image:width="1200") so social
        // crawlers don't reject the SVG due to mismatched metadata.
        .replace(/<meta property="og:image:type"[^>]*>/gi, '')
        .replace(/<meta property="og:image:width"[^>]*>/gi, '')
        .replace(/<meta property="og:image:height"[^>]*>/gi, '')
        .replace(/<meta property="og:image:alt"[^>]*>/gi, '');
    }
  }
  return out;
}

/**
 * Resolve per-route OG title/description: static map first, then a live
 * lookup for blog posts so a shared /blog/<slug> shows the POST's title and
 * excerpt (not the generic blog card).
 */
export async function resolveOg(url: URL, env: { CASE_STUDIES?: KVNamespace; BRIEFINGS_DB?: unknown }): Promise<OgOverride | null> {
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
          image: `/api/v1/og-image/blog/${m[1]}`,
        };
      }
    } catch {
      /* fall through to the generic blog card */
    }
    return OG_OVERRIDES['/blog'] ?? null;
  }

  // Briefing detail pages get dynamic OG images.
  const bm = /^\/threatintel\/briefings\/([a-z0-9-]{1,200})$/.exec(url.pathname);
  if (bm && env.BRIEFINGS_DB) {
    try {
      const row = await (env.BRIEFINGS_DB as unknown as { prepare: (q: string) => { bind: (...a: unknown[]) => { first: <T>() => Promise<T | null> } } })
        .prepare('SELECT title, date_range FROM briefings WHERE slug = ? LIMIT 1')
        .bind(bm[1])
        .first<{ title: string; date_range: string }>();
      if (row?.title) {
        return {
          title: `${row.title} · pranithjain.qzz.io`,
          description: `Threat intelligence briefing for ${row.date_range}. CISA KEV, NVD, abuse.ch, and MyThreatIntel aggregated findings.`,
          image: `/api/v1/og-image/briefing/${bm[1]}`,
        };
      }
    } catch { /* fall through */ }
  }

  // Research detail pages get dynamic OG images.
  const rm = /^\/threatintel\/research\/([a-z0-9-]{1,200})$/.exec(url.pathname);
  if (rm) {
    const slug = rm[1]!;
    const readableTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return {
      title: `${readableTitle} · Pranith Jain`,
      description: 'Original adversary-tracking and methodology research. Every quantitative claim sourced to named reporting.',
      image: `/api/v1/og-image/research/${slug}`,
    };
  }

  return findOgOverride(url.pathname);
}

/**
 * Mutate the static index.html so the OG / Twitter / canonical metadata
 * reflects the actual route.
 */
export async function injectOgMeta(
  response: Response,
  url: URL,
  env: { CASE_STUDIES?: KVNamespace; BRIEFINGS_DB?: unknown }
): Promise<Response> {
  const ct = response.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('text/html')) return response;
  const override = await resolveOg(url, env);
  const fullUrl = `${CANONICAL_ORIGIN}${url.pathname}`;
  const html = await response.text();
  const rewritten = rewriteOgMeta(html, override, fullUrl);
  const headers = new Headers(response.headers);
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

/** Cache TTL for OG-rewritten HTML. Etag-based key makes staleness impossible. */
export const OG_CACHE_TTL_SECONDS = 86_400;

/**
 * Cache the OG-rewritten HTML in the Cache API, keyed by `pathname @ etag`.
 */
export async function getOrInjectOg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL
): Promise<Response> {
  const assetRes = await env.ASSETS.fetch(request);
  const ct = assetRes.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('text/html')) return assetRes;

  const etag = assetRes.headers.get('etag') ?? assetRes.headers.get('last-modified') ?? 'unversioned';
  const cache = caches.default;
  const REWRITE_VERSION = 'v3';
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
