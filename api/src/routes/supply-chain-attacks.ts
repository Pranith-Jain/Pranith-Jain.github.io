import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';

import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/supply-chain-attacks
 *
 * Software supply-chain compromises across npm / PyPI / container registries.
 * Primary source is the GitHub Security Advisories `malware` set (reviewed
 * malicious-package advisories — the closest maintained equivalent of an
 * incident catalog), normalized to snake_case and dual-cached (Cache-API L1
 * + KV last-good with debounced writes) exactly like malicious-packages.ts.
 * Public, key-gated read (NOT admin-gated).
 *
 * History: this mirrored supplychainattack.org/incidents.json until 2026-09,
 * when the whole site (including its homepage) went 402 Payment Required.
 * The dead upstream was cut over to GHSA malware rather than retried — the
 * old code burned 3×15s attempts on every cold miss for a URL that can never
 * succeed. Attribution: every response echoes `source` + `source_url` linking
 * back to the advisory set. Neutral framing only (no endorsement).
 *
 * Footguns honored: ONE upstream subrequest (never fan out per-incident); KV
 * read only on miss; KV write debounced via shouldWriteLastGood in waitUntil;
 * NOT added to the /api/v1/snapshot composer (already near the 50-subrequest
 * cap). Enum value sets (status/severity/ecosystem/attackVector) are derived at
 * ingest, never hardcoded. `iocs` is treated as an open map.
 */

const GHSA_MALWARE_URL =
  'https://api.github.com/advisories?type=malware&per_page=100&sort=published&direction=desc';
const SOURCE = 'GitHub Security Advisories (malware)';
const SOURCE_URL = 'https://github.com/advisories?type=malware';
const DEFAULT_LICENSE = 'Data: GitHub Security Advisories — see https://github.com/advisories for terms.';

const CACHE_TTL_SECONDS = 900; // 15 min — upstream `revised`/lastBuildDate is GMT-midnight granularity
const KV_LAST_GOOD_KEY = 'supplychain:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

const MAX_INCIDENTS = 1000; // defensive cap on an untrusted upstream array (catalog is ~217)
const MAX_LIMIT = 500;

interface AffectedEntity {
  name: string;
  note?: string;
}
interface IncidentSource {
  url: string;
  title: string;
  publisher: string;
}
interface ScIncident {
  id: string;
  url: string;
  title: string;
  status: string;
  severity: string;
  ecosystems: string[];
  attack_vectors: string[];
  disclosed_date: string;
  last_updated: string;
  blast_radius: string;
  affected_entities: AffectedEntity[];
  summary: string;
  iocs: Record<string, string[]>;
  remediation: string[];
  sources: IncidentSource[];
}
interface Facets {
  ecosystems: Record<string, number>;
  statuses: Record<string, number>;
  severities: Record<string, number>;
  attack_vectors: Record<string, number>;
}
interface ScResponse {
  source: string;
  source_url: string;
  license: string;
  revised: string;
  generated_at: string;
  /** Number of incidents AFTER any query filter (i.e. incidents.length). */
  count: number;
  /** Total incidents in the catalog BEFORE filtering. */
  total: number;
  /** Counts across the full catalog (never filtered) so UI chips stay stable. */
  facets: Facets;
  incidents: ScIncident[];
  stale?: boolean;
  upstream_error?: string;
}

function asString(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
interface GhsaVuln {
  package?: { ecosystem?: string; name?: string };
  vulnerable_version_range?: string;
  patched_versions?: string[];
  first_patched_version?: string | { identifier?: string };
}
interface GhsaAdvisory {
  ghsa_id?: string;
  summary?: string;
  description?: string;
  severity?: string;
  html_url?: string;
  published_at?: string;
  updated_at?: string;
  vulnerabilities?: GhsaVuln[];
}

/** Map one GHSA malware advisory onto the catalog incident shape. */
function advisoryToIncident(raw: GhsaAdvisory): ScIncident {
  const vulns = Array.isArray(raw.vulnerabilities) ? raw.vulnerabilities : [];
  const ecosystems = [...new Set(vulns.map((v) => (v.package?.ecosystem ?? '').toLowerCase()).filter(Boolean))];
  const packages = [...new Set(vulns.map((v) => v.package?.name ?? '').filter(Boolean))];
  const remediation: string[] = [];
  for (const v of vulns.slice(0, 20)) {
    const name = v.package?.name ?? '';
    const patched = Array.isArray(v.patched_versions)
      ? v.patched_versions
      : typeof v.first_patched_version === 'string'
        ? [v.first_patched_version]
        : typeof v.first_patched_version?.identifier === 'string'
          ? [v.first_patched_version.identifier]
          : [];
    if (name && patched.length > 0) remediation.push(`Upgrade ${name} to ${patched[0]}`);
    else if (name && v.vulnerable_version_range) remediation.push(`Remove/quarantine ${name} (${v.vulnerable_version_range} affected)`);
  }
  if (remediation.length === 0 && packages.length > 0) remediation.push('Remove/quarantine the affected package versions');
  const ghsaId = asString(raw.ghsa_id, 200);
  const url =
    asString(raw.html_url, 600) || (ghsaId ? `https://github.com/advisories/${ghsaId}` : 'https://github.com/advisories?type=malware');
  return {
    id: ghsaId,
    url,
    title: asString(raw.summary, 400),
    status: 'confirmed',
    severity: asString(raw.severity, 40).toLowerCase() || 'high',
    ecosystems,
    attack_vectors: ['malicious-package'],
    disclosed_date: asString(raw.published_at, 40),
    last_updated: asString(raw.updated_at, 40),
    blast_radius: packages.slice(0, 10).join(', '),
    affected_entities: packages.slice(0, 200).map((name) => ({ name: name.slice(0, 300) })),
    summary: asString(raw.description, 4000),
    iocs: packages.length > 0 ? { packages: packages.slice(0, 500).map((p) => p.slice(0, 400)) } : {},
    remediation: remediation.slice(0, 50),
    sources: [{ url, title: 'GitHub Security Advisory', publisher: 'GitHub' }],
  };
}
function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildFacets(incidents: ScIncident[]): Facets {
  const facets: Facets = { ecosystems: {}, statuses: {}, severities: {}, attack_vectors: {} };
  for (const inc of incidents) {
    bump(facets.statuses, inc.status);
    bump(facets.severities, inc.severity);
    for (const e of inc.ecosystems) bump(facets.ecosystems, e);
    for (const v of inc.attack_vectors) bump(facets.attack_vectors, v);
  }
  return facets;
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(
  full: ScResponse,
  q: { ecosystem?: string; status?: string; severity?: string; limit?: number }
): ScResponse {
  let incidents = full.incidents;
  if (q.ecosystem) {
    const e = q.ecosystem.toLowerCase();
    incidents = incidents.filter((i) => i.ecosystems.some((x) => x.toLowerCase() === e));
  }
  if (q.status) {
    const s = q.status.toLowerCase();
    incidents = incidents.filter((i) => i.status.toLowerCase() === s);
  }
  if (q.severity) {
    const s = q.severity.toLowerCase();
    incidents = incidents.filter((i) => i.severity.toLowerCase() === s);
  }
  if (typeof q.limit === 'number') incidents = incidents.slice(0, q.limit);
  return { ...full, incidents, count: incidents.length };
}

export async function supplyChainAttacksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ecosystem = c.req.query('ecosystem')?.trim();
  const status = c.req.query('status')?.trim();
  const severity = c.req.query('severity')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || MAX_LIMIT, MAX_LIMIT) : undefined;
  const filterQ = { ecosystem, status, severity, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://supply-chain-attacks-cache.internal/v1?e=${ecosystem ?? ''}&s=${status ?? ''}&sev=${severity ?? ''}&l=${limit ?? ''}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: ScResponse | null = null;
  let upstreamError = '';

  try {
    // GITHUB_TOKEN (authed, 5k/hr) when configured; anonymous (60/hr shared
    // egress) otherwise — the 15min edge cache + 7d KV last-good keep us far
    // under either budget on the hourly-or-rarer refresh cadence.
    const headers: Record<string, string> = {
      'User-Agent': 'pranithjain-dfir/1.0',
      accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (c.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${c.env.GITHUB_TOKEN}`;
    const res = await fetchResilient(
      GHSA_MALWARE_URL,
      { headers } as RequestInit,
      { attempts: 2, timeoutMs: 15_000 }
    );
    if (res.ok) {
      const data = (await res.json()) as unknown;
      const rawIncidents = Array.isArray(data) ? data.slice(0, MAX_INCIDENTS) : [];
      const incidents = rawIncidents
        .map((r) => advisoryToIncident((r ?? {}) as GhsaAdvisory))
        .filter((i) => i.id && i.title);
      if (incidents.length > 0) {
        full = {
          source: SOURCE,
          source_url: SOURCE_URL,
          license: DEFAULT_LICENSE,
          revised: new Date().toISOString().slice(0, 10),
          generated_at: new Date().toISOString(),
          count: incidents.length,
          total: incidents.length,
          facets: buildFacets(incidents),
          incidents,
        };
      } else {
        upstreamError = 'upstream returned zero usable advisories';
      }
    } else {
      upstreamError = `upstream ${res.status}`;
    }
  } catch (err) {
    logError('handler failed', err);
    upstreamError = err instanceof Error ? err.message : 'fetch failed';
  }

  // Upstream failed → serve KV last-good (full catalog), filtered, marked stale.
  if (!full) {
    if (kv) {
      try {
        const staleRaw = await kv.get(KV_LAST_GOOD_KEY);
        if (staleRaw) {
          const staleFull = JSON.parse(staleRaw) as ScResponse;
          const out = applyFilters(staleFull, filterQ);
          return c.json({ ...out, stale: true, upstream_error: upstreamError }, 200, {
            'Cache-Control': 'public, max-age=300',
          });
        }
      } catch (_catchErr) {
        logError('handler failed', _catchErr);
        /* stale read failed; fall through to error */
      }
    }
    return c.json(
      {
        error: 'supplychainattack.org unavailable',
        message: upstreamError || 'no data',
        source: SOURCE,
        source_url: SOURCE_URL,
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }

  const body = applyFilters(full, filterQ);
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

  // Refresh KV last-good with the FULL (unfiltered) catalog so any filter combo
  // can degrade gracefully. Debounced so we don't write on every cache miss.
  if (kv) {
    const fullForKv = full;
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood('supply-chain-attacks')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
  }

  return response;
}
