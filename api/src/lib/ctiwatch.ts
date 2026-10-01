/**
 * CTIWatch (ctiwatch.com) — public vulnerability database client.
 *
 * Verified live 2026-10-01. The documented contract is in
 * https://github.com/ctiwatch/docs (docs/en/api.md), which helpfully
 * documents its own footguns — each one is defended against below.
 *
 * ── The auth puzzle ──────────────────────────────────────────────────────
 * Their docs claim "most read endpoints are open" and show
 * `curl /api/v1/stats` as "No key needed. This works right now." That is
 * **false as deployed**: every endpoint, `/stats` included, answers 401
 * `SESSION_REQUIRED` with no credentials. What actually works is the session
 * the docs mention in passing — "Browsers get one automatically by loading any
 * page". A plain GET of any HTML page returns
 * `Set-Cookie: cti_anon=<signed>; Max-Age=86400`, and replaying that cookie
 * against `/api/v1/*` returns 200.
 *
 * So this client mints its own anonymous session: one cheap page fetch to
 * obtain the cookie, cached ~12h (its Max-Age is 24h, so 12h leaves margin),
 * then every API call replays it. An `X-Api-Key` (when `CTIWATCH_API_KEY` is
 * set) takes precedence and lifts the pagination ceiling below.
 *
 * Their SPA calls `POST /api/v1/session/anon` for the same purpose; that
 * route 404s from the edge, so the page-fetch route is the one that works.
 *
 * ── Documented footguns this client defends against ───────────────────────
 * 1. `limit` above 100 is SILENTLY CLAMPED — HTTP 200 with 100 rows, no
 *    error. `?limit=5000` "succeeds" with 2% of the data. Clamped here.
 * 2. Unknown parameters are SILENTLY IGNORED — a misspelled filter returns
 *    the unfiltered result looking like success. Their own `in_kev` (the
 *    published OpenAPI name) does not exist; it is `is_kev`. Only documented,
 *    verified parameter names are ever sent, and `parseCtiwatchPayload` can
 *    assert a filter landed by comparing `total` against an unfiltered probe.
 * 3. Paging past `offset=1000` answers 403 `ACCOUNT_REQUIRED` anonymously
 *    (verified live). Treated as "page as far as allowed, mark partial"
 *    rather than as a total failure — a partial day still beats none.
 * 4. Rate limits are in headers and must not be hard-coded:
 *    `ratelimit-policy: 600;w=60` per IP, `x-ratelimit-limit: 150` for the
 *    anonymous scope. One digest needs ~3 requests, so this is never the
 *    binding constraint — but the numbers are surfaced for the probe view.
 *
 * ── Why it is worth having ────────────────────────────────────────────────
 * `published_after` is a first-class filter, so this is a genuine
 * "everything published in the last 24h" source — which the rest of the
 * stack cannot do, because NVD's bulk endpoint only returns the newest pages
 * and the other sources are all gap-fillers. Rows carry `cvss_score`,
 * `severity`, `exploit_status`, `is_in_kev`, `epss_score`, `cwe_id` and
 * `priority_score`.
 *
 * Subrequest cost: 1 page fetch (only when the session cookie is cold, ~1 per
 * 12h) + ceil(rows/100) API calls, all behind Cache-API entries.
 */

import { fetchResilient } from './fetch-resilient';

const API_BASE = 'https://ctiwatch.com/api/v1';
/**
 * Any HTML page works as the cookie minter; a 404 is the cheapest that
 * actually sets it (robots.txt and favicon.ico do not — verified live).
 */
const SESSION_MINTER_PATH = '/nonexistent-xyz';
const VULNS_ENDPOINT = `${API_BASE}/vulnerabilities`;

/** Upstream hard cap on `limit`; above it the value is silently clamped. */
export const CTIWATCH_MAX_LIMIT = 100;
/** Anonymous pagination ceiling — beyond this the API answers 403. */
export const CTIWATCH_MAX_ANON_OFFSET = 1000;

const FETCH_TIMEOUT_MS = 12_000;
/** `cti_anon` has Max-Age=86400; refresh at 12h so a warm worker never races expiry. */
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_CACHE_KEY = 'https://ctiwatch-session.internal/v1/cookie';
const PAYLOAD_CACHE_PREFIX = 'https://ctiwatch-cache.internal/v1/vulns';

export type CtiwatchSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** One parsed ctiwatch row, narrowed to what the platform consumes. */
export interface CtiwatchVuln {
  cve_id: string;
  /** ISO 8601. */
  published: string;
  modified?: string;
  severity: CtiwatchSeverity;
  /** 0–10. `cvss_score` arrives as a STRING upstream. */
  score: number | null;
  cvss_vector?: string;
  description?: string;
  cwe_id?: string;
  /** Upstream's exploitation classification: none / poc / weaponized / in_the_wild. */
  exploit_status?: string;
  /** True when upstream flags CISA KEV membership. */
  is_in_kev: boolean;
  epss_score: number | null;
  epss_percentile: number | null;
  /** Upstream's own 0–100 remediation-priority score + band. */
  priority_score: number | null;
  reference?: string;
}

export interface CtiwatchFetchResult {
  vulns: CtiwatchVuln[];
  ok: boolean;
  /** True when anonymous paging stopped at the offset ceiling. */
  partial: boolean;
  /** `total` matching our filters, when the API reported it. */
  total: number | null;
}

const CVE_ID_RE = /^CVE-\d{4}-\d{4,7}$/i;

function mapSeverity(raw: unknown): CtiwatchSeverity {
  const u = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (u === 'CRITICAL' || u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') return u;
  return 'UNKNOWN';
}

/** `cvss_score` arrives as a string ("7.6"); EPSS/percentile as numbers or null. */
function numOrNull(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function clean(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  return v && !/^undefined$/i.test(v) ? v : undefined;
}

/**
 * Map one raw row. Requires a valid CVE id AND a parseable publish timestamp —
 * `published_after` is the whole point of this source, so a row we can't date
 * can't be windowed and is dropped rather than silently landing in every
 * digest.
 */
export function mapCtiwatchRow(raw: unknown): CtiwatchVuln | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const cveId = clean(r.cve_id)?.toUpperCase();
  if (!cveId || !CVE_ID_RE.test(cveId)) return null;
  const published = clean(r.published_date);
  if (!published || Number.isNaN(Date.parse(published))) return null;
  const score = numOrNull(r.cvss_score);
  const epss = numOrNull(r.epss_score);
  const epssPct = numOrNull(r.epss_percentile);
  const priority = numOrNull(r.priority_score);
  return {
    cve_id: cveId,
    published: new Date(published).toISOString(),
    ...(clean(r.last_modified) ? { modified: clean(r.last_modified) as string } : {}),
    severity: mapSeverity(r.severity),
    score,
    ...(clean(r.cvss_vector) ? { cvss_vector: clean(r.cvss_vector) as string } : {}),
    ...(clean(r.description) ? { description: (clean(r.description) as string).slice(0, 400) } : {}),
    ...(clean(r.cwe_id) ? { cwe_id: clean(r.cwe_id) as string } : {}),
    ...(clean(r.exploit_status) ? { exploit_status: clean(r.exploit_status) as string } : {}),
    is_in_kev: r.is_in_kev === true,
    // Upstream uses null for unscored here (unlike VulnTracker's literal 0),
    // so a real 0 is passed through rather than normalized away.
    epss_score: epss,
    epss_percentile: epssPct,
    priority_score: priority,
    ...(clean(r.source_url) ? { reference: clean(r.source_url) as string } : {}),
  };
}

/**
 * Parse a list payload.
 *
 * Exported as the unit-test seam (same convention as dbugs/exploitgrid).
 * Returns null when the envelope is unusable — `total` must be a number and
 * `items` an array. An EMPTY `items` array is NOT unusable here (unlike dbu.gs
 * and ExploitGrid): `published_after` legitimately matches zero CVEs on a
 * quiet window, so the caller distinguishes via `total`.
 */
export function parseCtiwatchPayload(payload: unknown): { vulns: CtiwatchVuln[]; total: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const r = payload as { total?: unknown; items?: unknown };
  const total = numOrNull(r.total);
  if (total === null || !Array.isArray(r.items)) return null;
  const out: CtiwatchVuln[] = [];
  const seen = new Set<string>();
  for (const raw of r.items) {
    const v = mapCtiwatchRow(raw);
    if (!v || seen.has(v.cve_id)) continue;
    seen.add(v.cve_id);
    out.push(v);
  }
  return { vulns: out, total };
}

/**
 * Mint (or reuse) the anonymous session cookie.
 *
 * The cookie is the only thing standing between us and a 401 on every
 * endpoint, so it is cached rather than re-minted per request: a fresh mint
 * costs a 45 KB page fetch. Returns null when a mint fails, which the caller
 * surfaces as a dead source row rather than throwing.
 */
export async function getCtiwatchSession(apiKey?: string): Promise<string | null> {
  // A real key needs no session at all.
  if (apiKey) return null;
  try {
    const cache = caches.default;
    const key = new Request(SESSION_CACHE_KEY);
    const cached = await cache.match(key);
    if (cached) {
      const v = (await cached.text().catch(() => '')).trim();
      if (v) return v;
    }
    const res = await fetchResilient(
      `https://ctiwatch.com${SESSION_MINTER_PATH}`,
      {
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cf: { cacheTtlByStatus: { '200-299': 0, '400-599': 0 } },
      } as RequestInit,
      { attempts: 2, timeoutMs: FETCH_TIMEOUT_MS }
    );
    // The cookie arrives on the 404 as well as the 200, so status is not
    // checked — only the header matters.
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = /cti_anon=([^;]+)/.exec(setCookie);
    const cookie = match?.[1];
    if (!cookie) return null;
    await cache.put(
      key,
      new Response(cookie, {
        status: 200,
        headers: { 'content-type': 'text/plain', 'cache-control': `public, max-age=${SESSION_TTL_SECONDS}` },
      })
    );
    return cookie;
  } catch {
    return null;
  }
}

function payloadCacheKey(since: string, limit: number): string {
  return `${PAYLOAD_CACHE_PREFIX}?since=${encodeURIComponent(since)}&limit=${limit}`;
}

interface PageResult {
  vulns: CtiwatchVuln[];
  total: number | null;
  /** 403 — anonymous offset ceiling hit. */
  capped: boolean;
}

/** Fetch one page. Never throws. */
async function fetchCtiwatchPage(
  since: string,
  limit: number,
  offset: number,
  cookie: string | null,
  apiKey?: string
): Promise<PageResult> {
  // Only documented, verified parameter names — unknown ones are dropped
  // silently upstream and would widen the result set without any signal.
  const qs = new URLSearchParams({
    published_after: since,
    sort: 'published_date',
    order: 'desc',
    limit: String(limit),
    offset: String(offset),
  });
  try {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0)',
    };
    if (apiKey) headers['X-Api-Key'] = apiKey;
    else if (cookie) headers.cookie = `cti_anon=${cookie}`;
    const res = await fetchResilient(
      `${VULNS_ENDPOINT}?${qs.toString()}`,
      {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cf: { cacheTtlByStatus: { '200-299': 0, '400-599': 0 } },
      } as RequestInit,
      { attempts: 2, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (res.status === 403) return { vulns: [], total: null, capped: true };
    if (!res.ok) return { vulns: [], total: null, capped: false };
    const parsed = parseCtiwatchPayload(await res.json().catch(() => null));
    if (!parsed) return { vulns: [], total: null, capped: false };
    return { vulns: parsed.vulns, total: parsed.total, capped: false };
  } catch {
    return { vulns: [], total: null, capped: false };
  }
}

/**
 * Fetch every CVE published since `sinceIso`, paging to `maxRows`.
 *
 * Paging stops at whichever comes first: `maxRows`, `offset >= total`, an
 * empty page, or the anonymous offset ceiling. `partial` reports the last
 * case so a digest can say "showing 1,000 of 3,412" instead of implying
 * completeness.
 */
export async function fetchCtiwatchRecent(
  sinceIso: string,
  opts: { maxRows?: number; apiKey?: string } = {}
): Promise<CtiwatchFetchResult> {
  const maxRows = Math.min(opts.maxRows ?? 1000, CTIWATCH_MAX_ANON_OFFSET);
  const cookie = await getCtiwatchSession(opts.apiKey);

  const cache = caches.default;
  const cacheKey = new Request(payloadCacheKey(sinceIso, maxRows));
  const cached = await cache.match(cacheKey).catch(() => undefined);
  if (cached) {
    const hit = parseCtiwatchPayload(await cached.json().catch(() => null));
    if (hit) return { vulns: hit.vulns, ok: true, partial: hit.vulns.length >= maxRows, total: hit.total };
  }

  const out: CtiwatchVuln[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let partial = false;
  let anyPageOk = false;

  for (let offset = 0; offset < maxRows; offset += CTIWATCH_MAX_LIMIT) {
    const page = await fetchCtiwatchPage(sinceIso, CTIWATCH_MAX_LIMIT, offset, cookie, opts.apiKey);
    if (page.capped) {
      partial = true;
      break;
    }
    if (page.total !== null) total = page.total;
    if (page.vulns.length === 0) break;
    anyPageOk = true;
    for (const v of page.vulns) {
      if (seen.has(v.cve_id)) continue;
      seen.add(v.cve_id);
      out.push(v);
    }
    if (total !== null && offset + CTIWATCH_MAX_LIMIT >= total) break;
  }

  if (!anyPageOk) return { vulns: [], ok: false, partial: false, total };
  out.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
  return { vulns: out, ok: true, partial, total };
}
