import { injectScriptNonce } from './csp';
import { readBriefing } from '../api/src/lib/briefing-builder';
import { pageCardUrl } from './og-path';
import type { Env } from './env';

/**
 * Per-route OG title/description resolution.
 *
 * Precedence (see `findOgOverride` / `ogMetaForPath`):
 *   1. Hand-tuned `OG_OVERRIDES` exact match (polished copy, hand-written)
 *   2. `OG_OVERRIDES` prefix match (section branding)
 *   3. `deriveOgFromPath` (mechanical slug-derived fallback)
 *
 * NOTE: a build-time-generated per-route map (`og-overrides.generated.json`,
 * produced by `scripts/build-og-overrides.mjs`) previously sat at precedence
 * level 2, filling the ~400-route gap between the hand-tuned entries and the
 * slug-derived fallback. The generator script was never committed, so the
 * import broke the build. It has been removed for now; deep links fall back
 * to the slug-derived description (always ≥55 chars, X-card-valid). Restore
 * the generated map by committing `scripts/build-og-overrides.mjs`, adding it
 * to `prebuild`, and re-adding the import + `generated` lookup in `ogMetaForPath`.
 */

/**
 * L1-shadowed read of a blog post record from CASE_STUDIES KV.
 *
 * `resolveOg` and `resolveBlogJsonLd` both read the same `posts:<slug>` on
 * every blog page render — without an L1 that's 2 KV reads per page view.
 * The per-colo Cache-API shadow collapses that to ~1 KV read per colo per
 * TTL window. Posts are immutable once published; a 60s TTL means a
 * delete/unpublish reflects within a minute (acceptable for OG/JSON-LD
 * metadata, which is best-effort and never blocks the page).
 */
export const BLOG_POST_SHADOW_TTL = 60; // 60s — short so deletes reflect fast
function blogPostShadowReq(slug: string): Request {
  return new Request(`https://og-blog-post-shadow.internal/v1/${encodeURIComponent(slug)}`);
}
/** Safe per-colo Cache accessor — returns null when unavailable (e.g. in tests). */
function ogCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}
export async function readBlogPostShadowed<T>(env: Env, slug: string): Promise<T | null> {
  if (!env.CASE_STUDIES) return null;
  const cache = ogCache();
  const shadowReq = blogPostShadowReq(slug);
  if (cache) {
    try {
      const hit = await cache.match(shadowReq);
      if (hit) return (await hit.json()) as T | null;
    } catch {
      /* fall through to KV */
    }
  }
  let post: T | null = null;
  try {
    post = (await env.CASE_STUDIES.get(`posts:${slug}`, 'json')) as T | null;
  } catch {
    return null;
  }
  if (post) {
    if (cache) {
      try {
        await cache.put(
          shadowReq,
          new Response(JSON.stringify(post), {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${BLOG_POST_SHADOW_TTL}` },
          })
        );
      } catch {
        /* best-effort shadow */
      }
    }
  }
  return post;
}

/**
 * L1-shadowed read of the posts index (`posts:index`). Same rationale as
 * readBlogPostShadowed — the /blog listing page renders JSON-LD from the
 * index on every view.
 */
const BLOG_INDEX_SHADOW_REQ = new Request('https://og-blog-index-shadow.internal/v1');
async function readBlogIndexShadowed<T>(env: Env): Promise<T | null> {
  if (!env.CASE_STUDIES) return null;
  const cache = ogCache();
  if (cache) {
    try {
      const hit = await cache.match(BLOG_INDEX_SHADOW_REQ);
      if (hit) return (await hit.json()) as T | null;
    } catch {
      /* fall through to KV */
    }
  }
  let index: T | null = null;
  try {
    index = (await env.CASE_STUDIES.get('posts:index', 'json')) as T | null;
  } catch {
    return null;
  }
  if (index) {
    if (cache) {
      try {
        await cache.put(
          BLOG_INDEX_SHADOW_REQ,
          new Response(JSON.stringify(index), {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${BLOG_POST_SHADOW_TTL}` },
          })
        );
      } catch {
        /* best-effort shadow */
      }
    }
  }
  return index;
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

const OG_CACHE_VERSION = 'v10';

/**
 * Clamp a string so its UTF-8 byte length stays within `maxBytes`. Some
 * social-preview validators (and X's crawler in some modes) count bytes, not
 * codepoints — an em-dash (—) is 1 char but 3 bytes. Slicing by `.length`
 * leaves multi-byte titles over the byte limit. This trims on codepoints but
 * re-checks the byte length, appending an ellipsis (3 bytes) when truncated.
 */
function clampToBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  const ELLIPSIS = '…';
  const ellipsisBytes = Buffer.byteLength(ELLIPSIS, 'utf8');
  // Walk back codepoint-by-codepoint until (trimmed + ellipsis) fits.
  const chars = [...s];
  let trimmed = chars.join('');
  while (Buffer.byteLength(trimmed, 'utf8') + ellipsisBytes > maxBytes && chars.length > 0) {
    chars.pop();
    trimmed = chars.join('');
  }
  return trimmed.trimEnd() + ELLIPSIS;
}
export const OG_CACHE_TTL_SECONDS = 86400;

export const OG_OVERRIDES: Record<string, OgOverride> = {
  '/about': {
    title: 'About · pranithjain.qzz.io',
    description:
      'Security engineer working across DFIR, threat intelligence, detection engineering, and cloud security. Background, focus areas, and how to get in touch.',
  },
  '/skills': {
    title: 'Skills · pranithjain.qzz.io',
    description:
      'Capabilities across digital forensics & incident response, threat intelligence, detection engineering, cloud & application security, and security automation.',
  },
  '/experience': {
    title: 'Experience · pranithjain.qzz.io',
    description: 'Professional experience and roles in security engineering, DFIR, and threat intelligence.',
  },
  '/projects': {
    title: 'Projects · pranithjain.qzz.io',
    description:
      'Selected security projects and case studies — detection tooling, threat-intel platforms, and DFIR utilities built and shipped on the edge.',
  },
  '/blog': {
    title: 'Blog · pranithjain.qzz.io',
    description:
      'Writing on threat intelligence, detection engineering, DFIR, and cloud security — field notes, deep dives, and analysis.',
  },
  // The two highest-value organic-search surfaces previously fell through to
  // index.html's 97-char home <title>; give them their own short cards.
  '/dfir': {
    title: 'CRUCIBLE · DFIR Toolkit',
    description:
      'CRUCIBLE — 90+ free, browser-side DFIR tools: IOC checker, CVE prioritizer, crypto tracer, decoders, YARA/Sigma converter. No signup.',
    image: '/og-dfir.png?v=5',
  },
  '/radar': {
    title: 'SCOUT · Recon Scanner',
    description:
      'SCOUT — deep crawl, JS analysis, API discovery, secret detection, and 0-100 security scoring. Free, browser-driven recon.',
    image: '/og-scout.png?v=5',
  },
  '/copilot': {
    title: 'CTI Copilot',
    description:
      'An agentic CTI assistant that investigates indicators, actors, and CVEs across the platform feeds and returns a sourced, structured briefing.',
  },
  '/threatintel': {
    title: 'PANOPTICON · Threat Intel Platform',
    description:
      'PANOPTICON — live ransomware leaks, CVE × CISA KEV, cross-source IOC correlation, actor × MITRE, STIX 2.1 export. Edge-hosted and free.',
    image: '/og-threatintel.png?v=5',
  },
  '/threatintel/external-resources': {
    title: 'External Resources Catalog · pranithjain.qzz.io',
    description:
      'Off-site cross-references for threat-intel work — CTI dashboards, OSINT directories, training labs, malware samples, AI-security research.',
  },
  '/threatintel/facilities': {
    title: 'Facilities Database · pranithjain.qzz.io',
    description:
      'Strategic facilities worldwide — conflict zones, military bases, nuclear sites, disputed territories, sanctions targets, and critical infrastructure. Map view.',
  },
  '/threatnexus': {
    title: 'ARGUS · Threat Nexus',
    description:
      'ARGUS — nation-state threat intel dashboard with 3D globe, actor dossiers, relationship graphs, and live threat feeds. Interactive D3 + three.js.',
    image: '/og-argus.png?v=5',
  },
  '/threatintel/correlation': {
    title: 'Cross-source IOC correlation · pranithjain.qzz.io',
    description:
      'Indicators that appear in 2+ independent IOC feeds, ranked by source consensus. 18 feeds aggregated — overlap is the signal analysts trust.',
  },
  '/threatintel/live-iocs': {
    title: 'Live IOC stream · pranithjain.qzz.io',
    description:
      'Chronological firehose of individual indicators. Each entry carries a reporter handle, source feed, and first-observed timestamp across 10 sources.',
  },
  '/threatintel/detections': {
    title: 'Detections · pranithjain.qzz.io',
    description:
      'A detection-rule pack evaluated hourly against the live IOC stream. Cross-feed consensus, C2 + ransomware tagging, and phishing-campaign clustering.',
  },
  '/dfir/detection-lab': {
    title: 'Detection Lab · pranithjain.qzz.io',
    description:
      'Write a detection rule in a small JSON DSL and evaluate it in your browser against the live multi-feed IOC stream. Save, export, and re-use.',
  },
  '/dfir/rule-converter': {
    title: 'Rule Converter · pranithjain.qzz.io',
    description:
      'Universal detection-rule translation — Sigma, KQL, Splunk SPL, Elastic Lucene & EQL, YARA, DLP regex, and Semgrep. 100% client-side.',
  },
  '/dfir/netdraw': {
    title: 'NetDraw — Network Diagrams · pranithjain.qzz.io',
    description:
      'Browser-based network topology and architecture diagram editor. Drag-and-drop nodes, draw connections, build guided walkthroughs for DFIR, SOC, cloud security.',
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
      title: value.title ?? merged.title,
      description: value.description ?? merged.description,
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
  // NOTE: attribute gaps use `\s+`, not a literal space. index.html is
  // prettier-formatted, which wraps long meta tags across multiple lines (the
  // <meta name="description"> tag spans 3 lines). A single-space pattern
  // silently fails to match a wrapped tag — that was the bug that served the
  // 317-char home description (and the home twitter card) on every route.
  // Twitter tags use name= (the X/Twitter card spec requires name=, not
  // property=). LinkedIn only reads og:* so it never cared, but X is the sole
  // consumer of twitter:* and its parser expects name= — serving property=
  // was why per-page cards rendered on LinkedIn but not on X.
  let out = html
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"/i, `<link rel="canonical" href="${u}"`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"/i, `<meta property="og:url" content="${u}"`)
    .replace(/<meta\s+name="twitter:url"\s+content="[^"]*"/i, `<meta name="twitter:url" content="${u}"`);
  if (override) {
    // Escape first, THEN clamp — HTML entity escaping (e.g. ' → &#39;) expands
    // the string by up to 4 bytes per char, so clamping the raw string leaves
    // the escaped output over the byte limit. Clamp the escaped string so the
    // final meta content attribute stays within X/Twitter card limits.
    const t = clampToBytes(escapeAttr(override.title), 70);
    const d = clampToBytes(escapeAttr(override.description), 200);
    out = out
      .replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"/i, `<meta name="description" content="${d}"`)
      .replace(/<meta\s+property="og:title"\s+content="[^"]*"/i, `<meta property="og:title" content="${t}"`)
      .replace(/<meta\s+property="og:description"\s+content="[^"]*"/i, `<meta property="og:description" content="${d}"`)
      .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"/i, `<meta name="twitter:title" content="${t}"`)
      .replace(
        /<meta\s+name="twitter:description"\s+content="[^"]*"/i,
        `<meta name="twitter:description" content="${d}"`
      );

    if (override.image) {
      const imgUrl = `${CANONICAL_ORIGIN}${override.image}`;
      const imgAttr = escapeAttr(imgUrl);
      out = out
        .replace(/<meta\s+property="og:image"\s+content="[^"]*"/gi, `<meta property="og:image" content="${imgAttr}"`)
        .replace(/<meta\s+name="twitter:image"\s+content="[^"]*"/gi, `<meta name="twitter:image" content="${imgAttr}"`);
    }
  }
  if (nonce) {
    out = out.replace(/<script>/g, `<script nonce="${nonce}">`);
  }
  // Strip duplicate OG/Twitter meta tags that React Helmet injects into the
  // prerendered #root HTML. The <head> tags (rewritten above) are the
  // authoritative set; the #root duplicates are stale build-time copies that
  // point at the wrong URL/title and lack twitter:image. X's crawler picks
  // up duplicate meta tags and serves no card when it sees a twitter:card
  // without a matching twitter:image; LinkedIn reads <head> only and is
  // unaffected. Removing the #root duplicates makes X match LinkedIn.
  const rootIdx = out.indexOf('<div id="root"');
  if (rootIdx !== -1) {
    const head = out.slice(0, rootIdx);
    let root = out.slice(rootIdx);
    // Remove OG/Twitter meta tags + duplicate <title> from the prerendered
    // app HTML. Helmet renders them self-closing with content="...".
    root = root.replace(
      /<meta\s+(?:property="og:(?:title|url|description|image|type|site_name|locale|image:(?:type|width|height|alt))"|name="twitter:(?:card|title|description|image|url|site|creator|image:alt)")[^>]*\/?>/gi,
      ''
    );
    root = root.replace(/<title>[^<]*<\/title>/g, '');
    out = head + root;
  }
  return out;
}

/**
 * Section-aware branding for a generated page card, derived from the first
 * path segment. Keeps the dynamic per-page cards visually consistent with the
 * branded surface cards (CRUCIBLE / PANOPTICON / SCOUT / ARGUS).
 */
export interface OgPageMeta {
  title: string;
  description: string;
  /** Top type badge, e.g. "DFIR TOOLKIT". */
  badge: string;
  /** Footer product family, e.g. "PANOPTICON". */
  product: string;
}

/**
 * Resolve the best title/description + section branding for ANY route, so the
 * dynamic page-card generator (worker/og-data.ts) renders a card whose text
 * matches the meta tags the rewriter serves for the same URL.
 *
 * Title/description precedence:
 *   1. Hand-tuned `OG_OVERRIDES` exact match (polished copy)
 *   2. `deriveOgFromPath` (mechanical slug-derived fallback)
 *   3. `OG_OVERRIDES` prefix match (section branding)
 * Returns null only for the home page (which keeps the static home card).
 */
export function ogMetaForPath(pathname: string): OgPageMeta | null {
  const exact = OG_OVERRIDES[pathname];
  const override = findOgOverride(pathname);
  const derived = deriveOgFromPath(pathname);
  // The generated per-route map previously sat between `exact` and `derived`
  // here. It was removed (see file header) — deep links now fall through to
  // the slug-derived title/description, which is always ≥55 chars (X-card-valid).
  const title = exact?.title ?? derived?.title ?? override?.title;
  const description = exact?.description ?? derived?.description ?? override?.description;
  if (!title || !description) return null;

  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  const badge =
    first === 'dfir'
      ? 'DFIR TOOLKIT'
      : first === 'threatintel'
        ? 'THREAT INTEL'
        : first === 'radar'
          ? 'RECON SCANNER'
          : first === 'blog'
            ? 'BLOG POST'
            : 'SECURITY TOOLS';
  const product =
    first === 'threatintel'
      ? 'PANOPTICON'
      : first === 'radar'
        ? 'SCOUT'
        : first === 'threatnexus'
          ? 'ARGUS'
          : 'CRUCIBLE';

  // Byte-clamp to X/Twitter card limits (some validators count UTF-8 bytes).
  return { title: clampToBytes(title, 70), description: clampToBytes(description, 200), badge, product };
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
    const image = `/api/v1/og-image/blog/${m[1]}.png`;
    try {
      const post = await readBlogPostShadowed<{ title?: string; excerpt?: string }>(env, m[1]!);
      if (post?.title) {
        // Clamp to X/Twitter card limits: title ≤70, description ≤200 BYTES
        // (some validators count UTF-8 bytes, not codepoints — em-dashes are
        // 3 bytes). The `· pranithjain.qzz.io` suffix is reserved first so a
        // long post title doesn't push the combined title over the limit.
        const SUFFIX = ' · pranithjain.qzz.io';
        const maxTitle = 70 - Buffer.byteLength(SUFFIX, 'utf8');
        const rawTitle = clampToBytes(post.title, maxTitle);
        const description = clampToBytes(post.excerpt || OG_OVERRIDES['/blog']!.description, 199);
        return {
          title: `${rawTitle}${SUFFIX}`,
          description,
          image,
        };
      }
    } catch {
      /* fall through to the generic blog card (still with the dynamic image) */
    }
    return { ...(OG_OVERRIDES['/blog'] ?? { title: '', description: '' }), image };
  }

  // Briefing detail pages get a per-briefing card: dynamic PNG image always,
  // plus the briefing's own title/summary when it can be read from D1. A D1
  // miss still yields the dynamic image over the generic threat-intel card.
  const b = /^\/threatintel\/briefings\/([a-z0-9-]{1,200})$/i.exec(url.pathname);
  if (b) {
    const image = `/api/v1/og-image/briefing/${b[1]}.png`;
    if (env.BRIEFINGS_DB) {
      try {
        const briefing = await readBriefing(env.BRIEFINGS_DB, b[1]!);
        if (briefing) {
          // Clamp to X/Twitter card limits: title ≤70, description ≤200 BYTES.
          const SUFFIX = ' · pranithjain.qzz.io';
          const maxTitle = 70 - Buffer.byteLength(SUFFIX, 'utf8');
          const rawTitle = clampToBytes(briefing.title, maxTitle);
          const description = clampToBytes(
            briefing.executive_summary || OG_OVERRIDES['/threatintel']!.description,
            199
          );
          return {
            title: `${rawTitle}${SUFFIX}`,
            description,
            image,
          };
        }
      } catch {
        /* fall through to the generic threat-intel card (still with the image) */
      }
    }
    return { ...(OG_OVERRIDES['/threatintel'] ?? { title: '', description: '' }), image };
  }

  const override = findOgOverride(url.pathname);
  // Branded surface with its own static card (e.g. /dfir, /threatintel, /radar,
  // /threatnexus) → use its explicit override verbatim. These are the polished
  // section cards generated by scripts/generate-og-png.mjs.
  if (override?.image && OG_OVERRIDES[url.pathname]) return override;
  // Every other URL gets a UNIQUE generated card keyed to its path, so each
  // page has its own og:image instead of inheriting the section landing card.
  // Home '/' has no derived/override meta → null → index.html's default home
  // card is kept.
  const meta = ogMetaForPath(url.pathname);
  if (!meta) return override ?? null;
  return { title: meta.title, description: meta.description, image: pageCardUrl(url.pathname) };
}

/**
 * Fallback OG override derived from the URL path. When no explicit
 * OG_OVERRIDES entry matches, the page would otherwise keep the home-page
 * <title> and <meta description> — meaning hundreds of deep links share
 * identical metadata, which Google reads as duplicate/thin content and
 * flags as "Crawled - currently not indexed."
 *
 * This generates a unique, human-readable title + description from the
 * last path segment so every page at least has its own title. The home
 * page and root sections are excluded (they have explicit overrides or
 * should keep the home card).
 */
function deriveOgFromPath(pathname: string): OgOverride | null {
  if (pathname === '/' || pathname === '') return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // Title-case the last segment: "ioc-check" → "IOC Check"
  const last = segments[segments.length - 1]!;
  const titlePart = last
    .split(/[-_]/)
    .map((w) => {
      if (w.length <= 3) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');

  // Build a short context prefix from the first segment: "dfir" → "DFIR", "threatintel" → "Threat Intel"
  const first = segments[0]!;
  const sectionLabel =
    first === 'dfir'
      ? 'DFIR'
      : first === 'threatintel'
        ? 'Threat Intel'
        : first === 'blog'
          ? 'Blog'
          : first.charAt(0).toUpperCase() + first.slice(1);

  const title =
    segments.length > 1 ? `${titlePart} · ${sectionLabel} · pranithjain.qzz.io` : `${titlePart} · pranithjain.qzz.io`;
  const description = `${titlePart} — a free ${sectionLabel} tool on pranithjain.qzz.io. Browser-side security analysis, no signup required.`;
  // Byte-clamp to X/Twitter card limits (some validators count UTF-8 bytes).
  return { title: clampToBytes(title, 70), description: clampToBytes(description, 200) };
}

/* ── Blog structured data ─────────────────────────────────────────────────
 * Blog content lives in CASE_STUDIES KV and the index/posts render
 * client-side, so non-JS crawlers (and rich-results) see no BlogPosting/Blog
 * schema. The worker has KV access, so it injects JSON-LD at the edge. */

/** Minimal shape of a blog record in CASE_STUDIES KV — only the fields used for
 *  structured data (mirrors api/src/case-study/types Post / PostIndexEntry). */
interface BlogRecord {
  slug: string;
  title: string;
  excerpt?: string;
  publishedAt?: string;
  updatedAt?: string;
  tags?: string[];
  body?: string;
}

const BLOG_AUTHOR = {
  '@type': 'Person',
  name: 'Pranith Jain',
  url: CANONICAL_ORIGIN,
  // sameAs disambiguates the author entity across platforms — matches the
  // client-side BlogPosting JSON-LD in src/pages/BlogPost.tsx.
  sameAs: ['https://www.linkedin.com/in/pranithjain', 'https://x.com/Npj8448'],
};

/** Serialize as a JSON-LD <script>. `type="application/ld+json"` is DATA, not
 *  executable script, so CSP script-src does not apply and no nonce is needed.
 *  `<` is escaped so an author-supplied title can't close the block. */
function ldScript(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function plainText(s: string, max: number): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/[#*`>_[\]]/g, '')
    .trim()
    .slice(0, max);
}

function blogPostingLd(post: BlogRecord): string {
  const url = `${CANONICAL_ORIGIN}/blog/${post.slug}`;
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: plainText(post.excerpt || post.body || '', 200),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    url,
    mainEntityOfPage: url,
    author: BLOG_AUTHOR,
    publisher: { '@type': 'Person', name: 'Pranith Jain' },
    ...(post.tags && post.tags.length > 0 ? { keywords: post.tags.join(', ') } : {}),
  });
}

function blogIndexLd(posts: BlogRecord[]): string {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Pranith Jain — Blog',
    url: `${CANONICAL_ORIGIN}/blog`,
    blogPost: posts.slice(0, 50).map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: plainText(p.excerpt || '', 160),
      datePublished: p.publishedAt,
      url: `${CANONICAL_ORIGIN}/blog/${p.slug}`,
      author: { '@type': 'Person', name: 'Pranith Jain' },
    })),
  });
}

/**
 * Build the blog JSON-LD <script> for blog routes, read once from KV at the
 * edge. Returns '' for non-blog routes or when data is unavailable —
 * structured data is best-effort and never blocks the page. The result is
 * cached alongside the OG-rewritten HTML (pathname@etag), so it follows the
 * same ~1-day staleness window as the per-route OG metadata.
 */
export async function resolveBlogJsonLd(url: URL, env: Env): Promise<string> {
  if (!env.CASE_STUDIES) return '';
  try {
    const m = /^\/blog\/([a-z0-9-]{1,200})$/.exec(url.pathname);
    if (m && m[1] !== 'index') {
      const post = await readBlogPostShadowed<BlogRecord>(env, m[1]!);
      return post?.title ? blogPostingLd(post) : '';
    }
    if (url.pathname === '/blog') {
      const index = ((await readBlogIndexShadowed<BlogRecord[]>(env)) ?? []) as BlogRecord[];
      return index.length > 0 ? blogIndexLd(index) : '';
    }
  } catch {
    /* never let a KV hiccup blank the page */
  }
  return '';
}

/**
 * Routes that must be served `noindex`: the credential-input DFIR tools (a
 * public masked-password field reads as a deceptive "user login" to Google
 * Safe Browsing) plus the admin login. These are kept CRAWLABLE (noindex, not
 * robots Disallow) on purpose — Google must be able to re-crawl a flagged page
 * to confirm it is clean and lift a Safe Browsing warning; Disallow would block
 * that re-review. /admin is additionally Disallow-ed in robots.txt (it is
 * genuinely private and never needs a Safe Browsing re-review).
 */
const NOINDEX_PREFIXES = [
  '/dfir/breach',
  '/dfir/pgp-tool',
  '/dfir/phishing',
  '/dfir/stealer-parser',
  '/dfir/lolbins',
  '/dfir/powershell-deobf',
  '/dfir/ransomware-quant',
  '/dfir/malware-analyzer',
  '/dfir/infostealer-intel',
  '/dfir/open-directory',
  '/dfir/web-scan',
  '/dfir/subdomain-takeover',
  '/dfir/phishops',
  '/dfir/phishbook',
  '/dfir/xss-payloads',
  '/threatintel/telegram-leaks/channels',
  '/threatintel/misp-browser',
  '/threatintel/darkweb',
  '/threatintel/ransomware',
  '/threatintel/malware',
  '/threatintel/phishing',
  '/threatintel/breach',
  '/threatintel/c2-tracker',
  '/threatintel/infostealer',
  '/threatintel/crypto-scam',
  '/threatintel/scam-watch',
  '/threatintel/darkweb-tools',
  '/threatintel/malware-iocs',
  '/threatintel/phishing-wordlists',
  '/threatintel/tools/darknet-intel',
  '/admin',
];
function shouldNoindex(pathname: string): boolean {
  return NOINDEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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
      `https://og-html.internal/${OG_CACHE_VERSION}/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
    );
    const cached = await caches.default.match(cacheKey);
    const cachedText = cached ? await cached.text() : '';
    // Ignore a cached EMPTY body — a poisoned entry (see the write guard
    // below) must self-heal on the next request, not be served for the TTL.
    if (cached && cachedText.length > 0) {
      const body = nonce ? injectScriptNonce(cachedText, nonce) : cachedText;
      return new Response(body, {
        headers: {
          'content-type': cached.headers.get('content-type') ?? 'text/html;charset=UTF-8',
        },
      });
    }
  }

  const html = await response.text();
  // Never rewrite or cache a non-OK / empty upstream. A 304 or an empty read
  // during an asset-propagation race at deploy time would otherwise be cached
  // under `pathname@etag` and served blank for the full TTL — this is exactly
  // what blanked `/` and `/blog` on 2026-06-02. Returning the body uncached
  // lets the very next request re-read the (normally non-empty) asset.
  if (!response.ok || html.length === 0) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': response.headers.get('content-type') ?? 'text/html;charset=UTF-8' },
    });
  }
  const ogOverride = await resolveOg(url, env);
  const blogLd = await resolveBlogJsonLd(url, env);
  let ogRewritten = rewriteHtml(html, ogOverride, `${CANONICAL_ORIGIN}${url.pathname}${url.search}`);
  if (blogLd) ogRewritten = ogRewritten.replace(/<\/head>/i, `${blogLd}</head>`);
  if (shouldNoindex(url.pathname)) {
    ogRewritten = ogRewritten.replace(
      /<meta\s+name="robots"\s+content="[^"]*"/i,
      '<meta name="robots" content="noindex, follow"'
    );
  }
  const final = nonce ? injectScriptNonce(ogRewritten, nonce) : ogRewritten;

  const result = new Response(final, {
    headers: {
      'content-type': response.headers.get('content-type') ?? 'text/html;charset=UTF-8',
    },
  });

  if (etag && ogRewritten.length > 0) {
    const toCache = new Response(ogRewritten, {
      headers: {
        'content-type': response.headers.get('content-type') ?? 'text/html;charset=UTF-8',
        'cache-control': `public, max-age=${OG_CACHE_TTL_SECONDS}`,
      },
    });
    const ck = new Request(
      `https://og-html.internal/${OG_CACHE_VERSION}/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
    );
    ctx.waitUntil(caches.default.put(ck, toCache).catch((e) => console.warn('og-html cache put failed:', e)));
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
  const cacheKey = new Request(
    `https://og-html.internal/${OG_CACHE_VERSION}/${encodeURIComponent(url.host)}${url.pathname}@${encodeURIComponent(etag)}`
  );
  const cached = await cache.match(cacheKey);
  // Poisoned-cache guard. An empty cached body was being served to SPA
  // shell + 404-fallback responses on 2026-06-02 — the asset-propagation
  // race (see injectOgMeta's sibling guard) can write a zero-length body
  // here too, so check the length before serving. A clone is read so the
  // returned `cached` Response still has its body intact.
  if (cached) {
    const peeked = await cached.clone().text();
    if (peeked.length > 0) return cached;
  }

  const withOg = await injectOgMeta(assetRes, url, env, ctx);
  // Don't cache an empty body — the asset-propagation race at deploy
  // time can produce a 0-length read; serving that from cache for the
  // full TTL is the bug that hit `/`, `/blog`, and the 404 routes today.
  if (withOg.body) {
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
  }
  return withOg;
}
