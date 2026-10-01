/**
 * VulnTracker (vulntracker.io) — public daily-digest client.
 *
 * Verified live 2026-10-01 before being wired in. Most of the site's JSON API
 * is authenticated (`/api/cves`, `/api/cves/daily`, `/api/cves/stats`,
 * `/api/vendors/*` all return 401 "Missing Authorization header"), but two
 * unauthenticated surfaces exist and they are exactly the "daily reported CVE"
 * shape this platform wants:
 *
 *   GET /api/digest                → { success, data: [ { date, total_count,
 *                                      critical_count } … ] }  (30-day archive)
 *
 *   GET /api/digest/{YYYY-MM-DD}   → { success, data: { date, is_gated,
 *                                      total_count, critical_count,
 *                                      exploited_count, top_cves: [ … ],
 *                                      top_vendors: [], top_products: [] } }
 *
 * `is_gated` is `true` on every response and `top_vendors` / `top_products`
 * always come back empty — the vendor/product breakdown is behind a paid
 * subscription. What IS available per day: the exact total/critical/exploited
 * counts, plus `top_cves` capped at 7 entries carrying `cve_id`,
 * `vulnerability_name`, `severity`, `base_score`, `is_exploited`, `epss_score`,
 * `vendor_name`, `product_name`, `published_date`.
 *
 * So this is a *volume-and-peak* source, not a replacement CVE feed: the
 * counts describe how many CVEs landed that day (which nothing else in the
 * platform reports), and the 7 criticals are gap-fill candidates with vendor
 * and product already resolved — something NVD's bulk endpoint doesn't give us
 * cheaply.
 *
 * The blog RSS (https://vulntracker.io/blog/rss.xml, 30 items) is also public
 * and carries hand-written exploit-in-the-wild analysis with a CVE ID in every
 * recent title. It is the narrative layer that gives the digest numbers
 * context, so it ships alongside.
 *
 * `published_date` is date-only-ish ("2026-09-30T13:04:32Z") and EPSS scores
 * come back as literal 0 for rows VulnTracker hasn't scored — both are handled
 * rather than trusted.
 *
 * Subrequest cost: 1 digest + 1 RSS per build, both behind Cache-API entries.
 */

import { fetchResilient } from './fetch-resilient';

const DIGEST_ARCHIVE_ENDPOINT = 'https://vulntracker.io/api/digest';
const DIGEST_DAY_ENDPOINT = 'https://vulntracker.io/api/digest/';
const BLOG_RSS_ENDPOINT = 'https://vulntracker.io/blog/rss.xml';
const FETCH_TIMEOUT_MS = 12_000;
/**
 * The archive listing is an aggregate over 30 days of digests and measured
 * ~7s from the edge on a cold miss (vs ~0.6s for the single-day digest and
 * ~3.4s for the blog RSS) — it was timing out at the shared 12s when the three
 * surfaces ran concurrently. Given its own budget so the two cheap surfaces
 * aren't dragged down with it.
 */
const ARCHIVE_TIMEOUT_MS = 20_000;
const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
/** Digest counts for a past day are final within ~24h; RSS refreshes hourly. */
const DIGEST_CACHE_TTL_SECONDS = 30 * 60;
const RSS_CACHE_TTL_SECONDS = 60 * 60;
const CACHE_BASE = 'https://vulntracker-cache.internal/v1';

/** Upstream cap on the free tier's `top_cves` (verified live). */
export const VULNTRACKER_TOP_CVE_CAP = 7;

export type VulnTrackerSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** One day's aggregate counts. */
export interface VulnTrackerDayCounts {
  /** "YYYY-MM-DD". */
  date: string;
  total_count: number;
  critical_count: number;
  /** Only present on the per-day endpoint, not the archive listing. */
  exploited_count?: number;
}

/** One CVE from the per-day digest's (gated, capped) `top_cves`. */
export interface VulnTrackerTopCve {
  cve_id: string;
  severity: VulnTrackerSeverity;
  /** 0–10. Null when upstream carries no score. */
  base_score: number | null;
  vulnerability_name: string;
  vendor_name?: string;
  product_name?: string;
  /** Upstream flag: CISA KEV / confirmed exploitation. */
  is_exploited: boolean;
  /**
   * FIRST EPSS probability. Upstream emits a literal `0` for rows it hasn't
   * scored, which is indistinguishable from a genuine 0 — carried through as
   * `null` in that case so consumers don't read it as "certainly safe".
   */
  epss_score: number | null;
  epss_percentile: number | null;
  published_date?: string;
}

/** One day's full digest. */
export interface VulnTrackerDigest {
  date: string;
  total_count: number;
  critical_count: number;
  exploited_count: number | null;
  /**
   * True when upstream gated parts of the payload. Surfaced so the briefing
   * can say "top 7 of N" instead of implying these are all the day's CVEs.
   */
  is_gated: boolean;
  top_cves: VulnTrackerTopCve[];
}

export interface VulnTrackerBlogPost {
  title: string;
  link: string;
  /** ISO 8601. */
  published: string;
  description: string;
  /** Every CVE ID mentioned in the title, uppercased + deduped. */
  cve_ids: string[];
}

export interface VulnTrackerFetchResult {
  digest: VulnTrackerDigest | null;
  /** 30-day count archive, newest first. Empty when unavailable. */
  archive: VulnTrackerDayCounts[];
  blog: VulnTrackerBlogPost[];
  ok: boolean;
}

const CVE_ID_RE = /CVE-\d{4}-\d{4,7}/gi;

function mapSeverity(raw: unknown): VulnTrackerSeverity {
  const u = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (u === 'CRITICAL' || u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') return u;
  return 'UNKNOWN';
}

function numOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Parse one `top_cves` entry. Requires a valid CVE ID; `vulnerability_name` is
 * frequently an empty string upstream, so it is not required (the caller
 * substitutes the ID).
 */
export function mapVulnTrackerTopCve(raw: unknown): VulnTrackerTopCve | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const cveId = typeof r.cve_id === 'string' ? r.cve_id.trim().toUpperCase() : '';
  if (!cveId || !/^CVE-\d{4}-\d{4,7}$/.test(cveId)) return null;
  const epss = numOrNull(r.epss_score);
  const epssPct = numOrNull(r.epss_percentile);
  return {
    cve_id: cveId,
    severity: mapSeverity(r.severity),
    base_score: numOrNull(r.base_score),
    vulnerability_name: typeof r.vulnerability_name === 'string' ? r.vulnerability_name.trim() : '',
    ...(typeof r.vendor_name === 'string' && r.vendor_name.trim() ? { vendor_name: r.vendor_name.trim() } : {}),
    ...(typeof r.product_name === 'string' && r.product_name.trim() ? { product_name: r.product_name.trim() } : {}),
    is_exploited: r.is_exploited === true,
    // Upstream sends literal 0 for unscored rows; 0 is indistinguishable from
    // "scored and certain" so it is normalized to null rather than propagated.
    epss_score: epss === 0 ? null : epss,
    epss_percentile: epssPct === 0 ? null : epssPct,
    ...(typeof r.published_date === 'string' && r.published_date ? { published_date: r.published_date } : {}),
  };
}

/**
 * Parse a `/api/digest/{date}` payload. Returns null when unusable — a day
 * with `total_count: 0` still parses (that is a real quiet day), but a
 * missing `date` or a non-numeric `total_count` does not.
 */
export function parseVulnTrackerDigest(payload: unknown): VulnTrackerDigest | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const date = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '';
  if (!date) return null;
  const total = numOrNull(d.total_count);
  if (total === null) return null;
  const topCvesRaw = Array.isArray(d.top_cves) ? d.top_cves : [];
  const topCves: VulnTrackerTopCve[] = [];
  const seen = new Set<string>();
  for (const raw of topCvesRaw) {
    const c = mapVulnTrackerTopCve(raw);
    if (!c || seen.has(c.cve_id)) continue;
    seen.add(c.cve_id);
    topCves.push(c);
    if (topCves.length >= VULNTRACKER_TOP_CVE_CAP) break;
  }
  return {
    date,
    total_count: total,
    critical_count: numOrNull(d.critical_count) ?? 0,
    exploited_count: numOrNull(d.exploited_count),
    is_gated: d.is_gated === true,
    top_cves: topCves,
  };
}

/**
 * Parse a `/api/digest` archive payload. Newest first, malformed rows dropped.
 * Returns null only when the payload isn't a list at all.
 */
export function parseVulnTrackerArchive(payload: unknown): VulnTrackerDayCounts[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const out: VulnTrackerDayCounts[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '';
    const total = numOrNull(r.total_count);
    if (!date || total === null || seen.has(date)) continue;
    seen.add(date);
    const critical = numOrNull(r.critical_count);
    out.push({ date, total_count: total, critical_count: critical ?? 0 });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

/**
 * Parse the blog RSS. Every recent post leads with a CVE ID in its title, so
 * posts without one are dropped — this feed is a CVE source, not a blog.
 */
export function parseVulnTrackerRss(xml: string): VulnTrackerBlogPost[] {
  if (typeof xml !== 'string' || !xml.includes('<item')) return [];
  const out: VulnTrackerBlogPost[] = [];
  const seen = new Set<string>();
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  const grab = (block: string, tag: string): string => {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
    return re.exec(block)?.[1]?.trim() ?? '';
  };
  const decode = (s: string): string =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    if (!block) continue;
    const title = decode(grab(block, 'title'));
    const link = decode(grab(block, 'link'));
    if (!title || !link || seen.has(link)) continue;
    const cveIds: string[] = [];
    const idSeen = new Set<string>();
    for (const hit of title.matchAll(CVE_ID_RE)) {
      const id = hit[0].toUpperCase();
      if (idSeen.has(id)) continue;
      idSeen.add(id);
      cveIds.push(id);
    }
    if (cveIds.length === 0) continue;
    seen.add(link);
    const rawPub = grab(block, 'pubDate');
    const t = rawPub ? Date.parse(rawPub) : NaN;
    out.push({
      title,
      link,
      published: Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString(),
      description: decode(grab(block, 'description')),
      cve_ids: cveIds,
    });
  }
  return out;
}

function cacheKey(path: string): string {
  return `${CACHE_BASE}/${path}`;
}

async function cachedFetch(
  url: string,
  path: string,
  ttl: number,
  as: 'json' | 'text',
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<unknown | null> {
  try {
    const cache = caches.default;
    const key = cacheKey(path);
    const cached = await cache.match(new Request(key));
    if (cached) return as === 'json' ? await cached.json().catch(() => null) : await cached.text().catch(() => null);

    const res = await fetchResilient(
      url,
      {
        headers: {
          accept: as === 'json' ? 'application/json' : 'application/rss+xml, application/xml, */*',
          'user-agent': UA,
        },
        signal: AbortSignal.timeout(timeoutMs),
        cf: { cacheTtlByStatus: { '200-299': ttl, '400-599': 0 } },
      } as RequestInit,
      { attempts: 2, timeoutMs }
    );
    if (!res.ok) return null;
    const payload =
      as === 'json' ? ((await res.json().catch(() => null)) as unknown) : await res.text().catch(() => null);
    if (payload !== null) {
      await cache.put(
        new Request(key),
        new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
          status: 200,
          headers: {
            'content-type': as === 'json' ? 'application/json' : 'application/rss+xml; charset=utf-8',
            'cache-control': `public, max-age=${ttl}`,
          },
        })
      );
    }
    return payload;
  } catch {
    return null;
  }
}

/** Fetch one day's digest. Null on upstream failure or an unusable payload. */
export async function fetchVulnTrackerDigest(date: string): Promise<VulnTrackerDigest | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const payload = await cachedFetch(
    `${DIGEST_DAY_ENDPOINT}${date}`,
    `digest/${date}`,
    DIGEST_CACHE_TTL_SECONDS,
    'json'
  );
  return parseVulnTrackerDigest(payload);
}

/** Fetch the 30-day count archive, newest first. Empty on failure. */
export async function fetchVulnTrackerArchive(): Promise<VulnTrackerDayCounts[]> {
  const payload = await cachedFetch(
    DIGEST_ARCHIVE_ENDPOINT,
    'digest/archive',
    DIGEST_CACHE_TTL_SECONDS,
    'json',
    ARCHIVE_TIMEOUT_MS
  );
  return parseVulnTrackerArchive(payload) ?? [];
}

/** Fetch the blog RSS as CVE-narrative posts. Empty on failure. */
export async function fetchVulnTrackerBlog(): Promise<VulnTrackerBlogPost[]> {
  const payload = await cachedFetch(BLOG_RSS_ENDPOINT, 'blog/rss', RSS_CACHE_TTL_SECONDS, 'text');
  return typeof payload === 'string' ? parseVulnTrackerRss(payload) : [];
}

/**
 * Daily bundle used by the briefing builder: the day's digest plus the 30-day
 * archive (for the volume trend) plus the blog RSS (for narrative context).
 *
 * Never throws. `ok` reflects only the per-day digest, since that is the piece
 * the briefing's CVE findings depend on; the archive and RSS degrade
 * independently so a single dead surface can't blank the whole bundle.
 */
export async function fetchVulnTrackerDaily(date: string): Promise<VulnTrackerFetchResult> {
  const [digest, archive, blog] = await Promise.all([
    fetchVulnTrackerDigest(date),
    fetchVulnTrackerArchive(),
    fetchVulnTrackerBlog(),
  ]);
  return { digest, archive, blog, ok: digest !== null };
}

/** One row of the full /all-cves list (keyed surface only). */
export interface VulnTrackerFullCve {
  cve_id: string;
  severity: VulnTrackerSeverity;
  base_score: number | null;
  vulnerability_name: string;
  vendor_name?: string;
  product_name?: string;
  published_date?: string;
  is_exploited: boolean;
}

export interface VulnTrackerFullFeedResult {
  cves: VulnTrackerFullCve[];
  total: number | null;
  ok: boolean;
}

/**
 * Full /all-cves feed — DORMANT until a key exists.
 *
 * The `/api/cves` list behind vulntracker.io/all-cves answers 401 without an
 * `Authorization: Bearer` key on every query shape (verified live 2026-10-01
 * across limit/sort/severity/date_type variants). So this function is a no-op
 * returning `{ ok: false, cves: [] }` when `apiKey` is unset — the digest
 * route and the briefing builder never call it, and the keyed path activates
 * the moment `VULNTRACKER_API_KEY` is set via `wrangler secret put`.
 *
 * The response shape is assumed to mirror the digest's `top_cves` rows (same
 * field names, paginated); `parseVulnTrackerFullFeed` is the seam that will
 * absorb whatever the real envelope is once a key lets us see it, and it
 * fails closed (null) on anything it doesn't recognise rather than emitting
 * half-parsed rows.
 */
const FULL_CVES_ENDPOINT = 'https://vulntracker.io/api/cves';

export function parseVulnTrackerFullFeed(
  payload: unknown
): { cves: VulnTrackerFullCve[]; total: number | null } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const d = payload as { data?: unknown };
  const data = d.data;
  let rows: unknown[] = [];
  let total: number | null = null;
  if (Array.isArray(data)) {
    rows = data;
  } else if (typeof data === 'object' && data !== null) {
    const inner = data as { cves?: unknown; data?: unknown; total_count?: unknown; total?: unknown };
    if (Array.isArray(inner.cves)) rows = inner.cves;
    else if (Array.isArray(inner.data)) rows = inner.data;
    else return null;
    const t = inner.total ?? inner.total_count;
    total = typeof t === 'number' && Number.isFinite(t) ? t : null;
  } else {
    return null;
  }
  const out: VulnTrackerFullCve[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const c = mapVulnTrackerTopCve(raw);
    if (!c || seen.has(c.cve_id)) continue;
    seen.add(c.cve_id);
    out.push({
      cve_id: c.cve_id,
      severity: c.severity,
      base_score: c.base_score,
      vulnerability_name: c.vulnerability_name,
      ...(c.vendor_name ? { vendor_name: c.vendor_name } : {}),
      ...(c.product_name ? { product_name: c.product_name } : {}),
      ...(c.published_date ? { published_date: c.published_date } : {}),
      is_exploited: c.is_exploited,
    });
  }
  return { cves: out, total };
}

export async function fetchVulnTrackerFullFeed(opts: {
  apiKey?: string;
  limit?: number;
  publishedAfter?: string;
}): Promise<VulnTrackerFullFeedResult> {
  if (!opts.apiKey) return { cves: [], total: null, ok: false };
  try {
    const qs = new URLSearchParams({
      limit: String(Math.min(opts.limit ?? 100, 100)),
      sort_by: 'published_date',
      sort_order: 'desc',
      ...(opts.publishedAfter ? { published_date_start: opts.publishedAfter, date_type: 'published' } : {}),
    });
    const res = await fetchResilient(
      `${FULL_CVES_ENDPOINT}?${qs.toString()}`,
      {
        headers: { accept: 'application/json', authorization: `Bearer ${opts.apiKey}`, 'user-agent': UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cf: { cacheTtlByStatus: { '200-299': 0, '400-599': 0 } },
      } as RequestInit,
      { attempts: 2, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) return { cves: [], total: null, ok: false };
    const parsed = parseVulnTrackerFullFeed(await res.json().catch(() => null));
    if (!parsed) return { cves: [], total: null, ok: false };
    return { cves: parsed.cves, total: parsed.total, ok: true };
  } catch {
    return { cves: [], total: null, ok: false };
  }
}
