/**
 * dbugs (dbu.gs) — public vulnerability database client.
 *
 * Verified live 2026-10-01 before being wired in. Endpoint is
 * `POST https://dbu.gs/v1/vulnerabilities` with a JSON body, no auth and no
 * API key. Response:
 *
 *   { count: 435392, rows: [ {
 *       vulner_id, cve_id, max_score, max_severity, created, updated,
 *       has_fix, has_exploits, vendors[], products[], cwe_ids[],
 *       impacts[], priority_vendor, priority_product, references[],
 *       cvss: { NVD: { En: [{score, vector, version, severity}] }, Mitre: {...} }
 *   } ] }
 *
 * Three schema quirks this client has to defend against — all verified live,
 * all of which fail *silently* (HTTP 200 with an empty payload) if ignored:
 *
 *   1. `limit` is validated `less_than_equal` against 50. Asking for 51+
 *      returns 200 with `rows` ABSENT and a `details[]` validation envelope —
 *      not a 4xx, and not a clamp. `parseDbugsPayload` treats a missing/empty
 *      `rows` as failure so a bad limit surfaces as a dead source row rather
 *      than a silently-zero one.
 *   2. The body is a STRICT schema: unknown keys are rejected with
 *      `extra_forbidden`. So this module never forwards caller options
 *      blindly — only `limit` and `page` are ever sent.
 *   3. Pagination is `page` only. `offset` / `skip` / `per_page` are all
 *      `extra_forbidden`, so they fail the same silent way as (1).
 *
 * `page` walks newest-first (`created` desc) and rows span ~2 days per 500
 * fetched, so the cve-recent gap-filler only ever needs page 1 at limit 50.
 *
 * Subrequest cost: exactly 1 per warm cycle, behind a Cache-API entry with the
 * same shape cve-tg-parser uses. Never throws — a dead source degrades to a
 * count-0 row in the aggregate.
 */

import { fetchResilient } from './fetch-resilient';

/** Upstream hard cap on `limit`. Exceeding it returns a silent empty payload. */
export const DBUGS_MAX_LIMIT = 50;

const DBUGS_ENDPOINT = 'https://dbu.gs/v1/vulnerabilities';
const FETCH_TIMEOUT_MS = 12_000;
/** Newest-first rows churn slowly; 30 min matches the other cve-recent tiers. */
const SHARED_CACHE_TTL_SECONDS = 30 * 60;
const CACHE_BASE = 'https://dbugs-cache.internal/v1';

export type DbugsSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** One parsed dbu.gs row, narrowed to the fields the platform consumes. */
export interface DbugsVuln {
  cve_id: string;
  /** ISO date only ("YYYY-MM-DD") — dbu.gs exposes no time component. */
  created: string;
  updated: string;
  severity: DbugsSeverity;
  score: number | null;
  vendor?: string;
  product?: string;
  cwes: string[];
  /** Short human-readable weakness names ("Insufficient Session Expiration"). */
  impacts: string[];
  /** Upstream flag: a public exploit / PoC is linked from this record. */
  has_exploits: boolean;
  /** Upstream flag: a patched version or vendor advisory exists. */
  has_fix: boolean;
  /** Best available reference URL (vendor advisory preferred). */
  reference?: string;
  /** dbu.gs's own PT- identifier, used as the detail-page path. */
  vulner_id?: string;
}

export interface DbugsFetchResult {
  vulns: DbugsVuln[];
  ok: boolean;
}

const CVE_ID_RE = /^CVE-\d{4}-\d{4,7}$/i;

interface DbugsRawRow {
  cve_id?: unknown;
  vulner_id?: unknown;
  created?: unknown;
  updated?: unknown;
  max_severity?: unknown;
  max_score?: unknown;
  priority_vendor?: unknown;
  priority_product?: unknown;
  vendors?: unknown;
  products?: unknown;
  cwe_ids?: unknown;
  impacts?: unknown;
  has_exploits?: unknown;
  has_fix?: unknown;
  references?: unknown;
}

function mapSeverity(raw: unknown): DbugsSeverity {
  const u = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (u === 'CRITICAL' || u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') return u;
  // Upstream emits the literal string "NULL" for unrated rows (seen live,
  // ~1 in 500) — distinct from a missing field, and neither is a severity.
  return 'UNKNOWN';
}

/**
 * dbu.gs writes the literal string "Undefined" where it has no value —
 * verified live across `priority_vendor`, `priority_product`, and entries
 * inside the `vendors[]` / `products[]` arrays (4 of 50 rows on one sample).
 * That is JSON, so it survives every `.trim()`/truthiness check and renders
 * as "[dbu.gs] Undefined Undefined" in the UI. Treat it as absent.
 */
const SENTINEL_UNDEFINED = /^undefined$/i;

/** Trim a value, or undefined when it is blank or dbu.gs's "Undefined" sentinel. */
function cleanString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (!v || SENTINEL_UNDEFINED.test(v)) return undefined;
  return v;
}

function firstString(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  for (const v of raw) {
    const c = cleanString(v);
    if (c) return c;
  }
  return undefined;
}

function stringList(raw: unknown, cap = 8): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const c = cleanString(v);
    if (c) out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Pick the best reference URL. dbu.gs labels each reference with a `source`;
 * a vendor advisory beats a third-party write-up, so prefer that tier before
 * falling back to whatever came first.
 */
function pickReference(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  const refs = raw.filter(
    (r): r is { ref_url?: unknown; source?: unknown; is_deleted?: unknown } => typeof r === 'object' && r !== null
  );
  const usable = refs.filter(
    (r) => r.is_deleted !== true && typeof r.ref_url === 'string' && r.ref_url.startsWith('http')
  );
  const advisory = usable.find((r) => typeof r.source === 'string' && /advisory|vendor|patch/i.test(r.source));
  const chosen = advisory ?? usable[0];
  return chosen ? String(chosen.ref_url) : undefined;
}

/**
 * Map one raw row. Returns null for anything without a usable CVE ID —
 * rows keyed only by a vendor advisory are out of scope for a CVE aggregate.
 */
export function mapDbugsRow(raw: DbugsRawRow): DbugsVuln | null {
  const cveId = typeof raw.cve_id === 'string' ? raw.cve_id.trim().toUpperCase() : '';
  if (!cveId || !CVE_ID_RE.test(cveId)) return null;
  const created = typeof raw.created === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.created) ? raw.created : '';
  if (!created) return null;
  const updated = typeof raw.updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.updated) ? raw.updated : created;
  const score = typeof raw.max_score === 'number' && Number.isFinite(raw.max_score) ? raw.max_score : null;
  const vendor = cleanString(raw.priority_vendor) ?? firstString(raw.vendors);
  const product = cleanString(raw.priority_product) ?? firstString(raw.products);
  return {
    cve_id: cveId,
    created,
    updated,
    severity: mapSeverity(raw.max_severity),
    score,
    ...(vendor ? { vendor } : {}),
    ...(product ? { product } : {}),
    cwes: stringList(raw.cwe_ids),
    impacts: stringList(raw.impacts, 4),
    has_exploits: raw.has_exploits === true,
    has_fix: raw.has_fix === true,
    ...(pickReference(raw.references) ? { reference: pickReference(raw.references) as string } : {}),
    ...(typeof raw.vulner_id === 'string' && raw.vulner_id ? { vulner_id: raw.vulner_id } : {}),
  };
}

/**
 * Parse a dbu.gs payload into normalized vulns.
 *
 * Exported as the unit-test seam — tests feed saved fixtures here instead of
 * hitting dbu.gs (same convention as cve-tg-parser's `parseChannelHtml`).
 *
 * Returns null when the payload is unusable, which is what the caller reports
 * as `ok: false`. An empty `rows` is unusable by definition: every reachable
 * page-1 query returns at least some rows, so empty means "bad limit, bad
 * pagination key, or an upstream shape change" — never a legitimately quiet day.
 */
export function parseDbugsPayload(payload: unknown): DbugsVuln[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const rows = (payload as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const out: DbugsVuln[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue;
    const v = mapDbugsRow(r as DbugsRawRow);
    if (!v || seen.has(v.cve_id)) continue;
    seen.add(v.cve_id);
    out.push(v);
  }
  return out.length > 0 ? out : null;
}

function cacheKey(page: number): string {
  return `${CACHE_BASE}?page=${page}`;
}

/**
 * Fetch one page of dbu.gs rows through the Cache API.
 *
 * `limit` is clamped to DBUGS_MAX_LIMIT rather than trusted from the caller —
 * over-asking is the silent-empty-payload failure mode documented above.
 */
export async function fetchDbugsPage(page = 1): Promise<DbugsVuln[] | null> {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const limit = DBUGS_MAX_LIMIT;
  try {
    const cache = caches.default;
    const key = cacheKey(p);
    const cached = await cache.match(new Request(key));
    if (cached) return parseDbugsPayload(await cached.json().catch(() => null));

    const res = await fetchResilient(
      DBUGS_ENDPOINT,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ limit, page: p }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // dbu.gs sits behind nginx with no cache headers worth trusting, and a
        // POST is not edge-cacheable by default — cf directives are omitted
        // deliberately rather than passed as no-ops.
      } as RequestInit,
      { attempts: 2, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) return null;
    const payload = (await res.json().catch(() => null)) as unknown;
    const parsed = parseDbugsPayload(payload);
    if (parsed) {
      await cache.put(
        new Request(key),
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${SHARED_CACHE_TTL_SECONDS}`,
          },
        })
      );
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fetch dbu.gs for the cve-recent gap-filler. Never throws — a dead upstream
 * reports `{ ok: false, vulns: [] }` so the aggregate still ships.
 */
export async function fetchDbugsRecent(): Promise<DbugsFetchResult> {
  const vulns = await fetchDbugsPage(1);
  return { vulns: vulns ?? [], ok: vulns !== null };
}
