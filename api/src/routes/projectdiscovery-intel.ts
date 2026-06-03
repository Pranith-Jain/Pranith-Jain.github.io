import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * ProjectDiscovery Cloud integration — three FREE capabilities, no paid
 * PDCP credits consumed:
 *
 *   1. Credential exposure  GET /api/v1/pd/leaks?q=<email|domain>
 *        → api.projectdiscovery.io/v1/leaks/stats/{email|domain}
 *        Free, no key. Combolist exposure, breach timeline, top login URLs,
 *        masked sample creds, country stats.
 *
 *   2. Subdomain recon      GET /api/v1/pd/subdomains?domain=<apex>
 *        → dns.projectdiscovery.io/dns/{domain}/subdomains (Chaos)
 *        Free public-domain recon; needs a free PDCP key (Authorization header).
 *        503 when PDCP_API_KEY is unset.
 *
 *   3. CVE catalog          GET /api/v1/pd/cves?q=&severity=&limit=
 *        → nuclei-templates/cves.json (GitHub raw, JSONL)
 *        Free, no key. The set of CVEs that have a public Nuclei detection
 *        template — i.e. known-detectable/exploitable — with severity + CVSS.
 *
 * Active CVE *scanning* (POST /scans) is intentionally NOT integrated: it
 * consumes paid PDCP credits and requires authorization over the target.
 */

const PD_API_BASE = 'https://api.projectdiscovery.io/v1';
const CHAOS_BASE = 'https://dns.projectdiscovery.io/dns';
const CVES_JSON_URL = 'https://raw.githubusercontent.com/projectdiscovery/nuclei-templates/main/cves.json';
const CVEDB_BASE = 'https://cvedb.shodan.io/cve';

const CVE_ID_RE = /^cve-\d{4}-\d{4,}$/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// ─── 1. Credential / leak exposure ─────────────────────────────────────────

const LEAKS_CACHE_TTL = 3600;

export async function pdLeaksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (!q) return c.json({ error: 'q parameter required (email or domain)' }, 400, { 'cache-control': 'no-store' });

  const kind: 'email' | 'domain' = q.includes('@') ? 'email' : 'domain';
  if (kind === 'email' && !EMAIL_RE.test(q)) {
    return c.json({ error: 'invalid email format' }, 400, { 'cache-control': 'no-store' });
  }
  if (kind === 'domain' && !DOMAIN_RE.test(q)) {
    return c.json({ error: 'invalid domain format' }, 400, { 'cache-control': 'no-store' });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://pd-leaks-cache.internal/v1/${kind}/${encodeURIComponent(q)}`);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const url = `${PD_API_BASE}/leaks/stats/${kind}?${kind}=${encodeURIComponent(q)}`;
  let data: unknown;
  try {
    const res = await fetchResilient(
      url,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain.qzz.io DFIR toolkit (read-only)' } },
      { attempts: 3, timeoutMs: 12_000 }
    );
    if (!res.ok) {
      return c.json({ error: `ProjectDiscovery upstream ${res.status}` }, 502, { 'cache-control': 'no-store' });
    }
    data = await res.json();
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ProjectDiscovery unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }

  const response = new Response(JSON.stringify({ query: q, kind, generated_at: new Date().toISOString(), data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${LEAKS_CACHE_TTL}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}

// ─── 2. Subdomain recon (Chaos) ────────────────────────────────────────────

const SUBDOMAINS_CACHE_TTL = 6 * 60 * 60;
/** Chaos returns up to tens of thousands of subdomains; cap the payload. */
const MAX_SUBDOMAINS = 3000;

interface ChaosResponse {
  domain?: string;
  subdomains?: string[];
  count?: number;
}

export async function pdSubdomainsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = (c.req.query('domain') ?? '').trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid_domain', detail: 'expected an apex domain like example.com' }, 400, {
      'cache-control': 'no-store',
    });
  }
  if (!c.env.PDCP_API_KEY) {
    return c.json({ error: 'not_configured', detail: 'PDCP_API_KEY secret is not set' }, 503, {
      'cache-control': 'no-store',
    });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://pd-subdomains-cache.internal/v1/${encodeURIComponent(domain)}`);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  let chaos: ChaosResponse;
  try {
    const res = await fetchResilient(
      `${CHAOS_BASE}/${encodeURIComponent(domain)}/subdomains`,
      {
        headers: {
          // Send the PDCP key on BOTH headers: legacy Chaos used the raw key in
          // `Authorization`, the unified PDCP cloud key uses `X-Api-Key`. The
          // dns.projectdiscovery.io endpoint now expects the PDCP key, so cover
          // both schemes — harmless and avoids a 401 on whichever it checks.
          Authorization: c.env.PDCP_API_KEY,
          'X-Api-Key': c.env.PDCP_API_KEY,
          accept: 'application/json',
          'user-agent': 'pranithjain.qzz.io DFIR toolkit (read-only)',
        },
      },
      { attempts: 2, timeoutMs: 20_000 }
    );
    if (!res.ok) {
      const detail = await res
        .text()
        .then((t) => t.slice(0, 200))
        .catch(() => '');
      return c.json(
        { error: 'upstream_unavailable', domain, upstream_status: res.status, upstream_detail: detail },
        502,
        { 'cache-control': 'no-store' }
      );
    }
    chaos = (await res.json()) as ChaosResponse;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Chaos unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }

  const all = Array.isArray(chaos.subdomains) ? chaos.subdomains : [];
  // Chaos returns bare labels (e.g. "api", "*.cfe") — qualify to full hostnames.
  const fqdns = all.map((s) => (s === '*' || s.endsWith(domain) ? s : `${s}.${domain}`));
  const total = typeof chaos.count === 'number' ? chaos.count : fqdns.length;

  const response = new Response(
    JSON.stringify({
      domain,
      generated_at: new Date().toISOString(),
      count: total,
      truncated: fqdns.length > MAX_SUBDOMAINS,
      subdomains: fqdns.slice(0, MAX_SUBDOMAINS),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${SUBDOMAINS_CACHE_TTL}` },
    }
  );
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}

// ─── 3. CVE catalog (Nuclei templates) ─────────────────────────────────────

const CVES_CACHE_TTL = 6 * 60 * 60;
const CVES_DEFAULT_LIMIT = 100;
const CVES_MAX_LIMIT = 500;

interface CveTemplate {
  ID?: string;
  Info?: {
    Name?: string;
    Severity?: string;
    Description?: string;
    Classification?: { CVSSScore?: string };
  };
  file_path?: string;
}

export interface PdCve {
  id: string;
  name: string;
  severity: string;
  cvss: string | null;
  description: string;
  template_url: string;
  nvd_url: string;
}

/** Parse the JSONL catalog (one JSON object per line). */
function parseCves(text: string): PdCve[] {
  const out: PdCve[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: CveTemplate;
    try {
      rec = JSON.parse(trimmed) as CveTemplate;
    } catch {
      continue;
    }
    if (!rec.ID) continue;
    out.push({
      id: rec.ID,
      name: rec.Info?.Name ?? '',
      severity: (rec.Info?.Severity ?? 'unknown').toLowerCase(),
      cvss: rec.Info?.Classification?.CVSSScore ?? null,
      description: (rec.Info?.Description ?? '').trim(),
      template_url: rec.file_path
        ? `https://github.com/projectdiscovery/nuclei-templates/blob/main/${rec.file_path}`
        : 'https://github.com/projectdiscovery/nuclei-templates',
      nvd_url: `https://nvd.nist.gov/vuln/detail/${rec.ID}`,
    });
  }
  return out;
}

/** CVE id sort key — newest first (year desc, then sequence desc). */
function cveSortKey(id: string): number {
  const m = /^CVE-(\d{4})-(\d+)$/.exec(id);
  if (!m) return 0;
  return Number(m[1]) * 1_000_000 + Math.min(999_999, Number(m[2]));
}

export async function pdCvesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  const severity = (c.req.query('severity') ?? '').trim().toLowerCase();
  const limitRaw = Number.parseInt(c.req.query('limit') ?? String(CVES_DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(CVES_MAX_LIMIT, Math.max(1, limitRaw)) : CVES_DEFAULT_LIMIT;

  let text: string | null = null;
  try {
    const res = await fetchResilient(
      CVES_JSON_URL,
      {
        headers: { accept: 'application/json,*/*', 'user-agent': 'pranithjain-dfir/1.0' },
        cf: { cacheTtl: CVES_CACHE_TTL, cacheEverything: true },
      },
      { attempts: 3, timeoutMs: 20_000 }
    );
    if (res.ok) text = await res.text();
  } catch {
    text = null;
  }
  if (!text) {
    return c.json({ error: 'catalog_unavailable', detail: 'could not fetch nuclei-templates cves.json' }, 502, {
      'cache-control': 'no-store',
    });
  }

  const all = parseCves(text);
  const filtered = all.filter((cve) => {
    if (severity && cve.severity !== severity) return false;
    if (!q) return true;
    return (
      cve.id.toLowerCase().includes(q) ||
      cve.name.toLowerCase().includes(q) ||
      cve.description.toLowerCase().includes(q)
    );
  });
  filtered.sort((a, b) => cveSortKey(b.id) - cveSortKey(a.id));

  return c.json(
    {
      generated_at: new Date().toISOString(),
      catalog_total: all.length,
      total_matches: filtered.length,
      truncated: filtered.length > limit,
      count: Math.min(limit, filtered.length),
      items: filtered.slice(0, limit),
    },
    200,
    { 'cache-control': `public, max-age=${CVES_CACHE_TTL}` }
  );
}

// ─── CVE detail enrichment (Shodan CVEDB — free, no key) ────────────────────

const CVEDB_CACHE_TTL = 12 * 60 * 60;

interface CvedbResponse {
  cve_id?: string;
  summary?: string;
  cvss?: number;
  cvss_v3?: number;
  epss?: number;
  ranking_epss?: number;
  kev?: boolean;
  propose_action?: string;
  ransomware_campaign?: string;
  references?: string[];
  published_time?: string;
  cpes?: string[];
}

interface Ssvc {
  exploitation: string | null;
  automatable: string | null;
  technical_impact: string | null;
  /** Derived CISA SSVC action label (approximation of the published tree). */
  decision: string | null;
}

/** CISA Vulnrichment raw path: develop/{YYYY}/{floor(num/1000)}xxx/CVE-….json */
function vulnrichmentUrl(cveUpper: string): string | null {
  const m = /^CVE-(\d{4})-(\d+)$/.exec(cveUpper);
  if (!m) return null;
  const bucket = `${Math.floor(Number(m[2]) / 1000)}xxx`;
  return `https://raw.githubusercontent.com/cisagov/vulnrichment/develop/${m[1]}/${bucket}/${cveUpper}.json`;
}

function deriveSsvcDecision(expl: string | null, autom: string | null, impact: string | null): string | null {
  if (!expl) return null;
  const e = expl.toLowerCase();
  const a = (autom ?? '').toLowerCase();
  const i = (impact ?? '').toLowerCase();
  if (e === 'active' && a === 'yes' && i === 'total') return 'Act';
  if (e === 'active') return 'Attend';
  if (e === 'poc' && a === 'yes' && i === 'total') return 'Attend';
  if (e === 'poc') return 'Track*';
  return 'Track';
}

async function fetchSsvc(cveUpper: string): Promise<Ssvc | null> {
  const url = vulnrichmentUrl(cveUpper);
  if (!url) return null;
  try {
    const res = await fetchResilient(
      url,
      {
        headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
        cf: { cacheTtl: 6 * 60 * 60, cacheEverything: true },
      },
      { attempts: 2, timeoutMs: 12_000 }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      containers?: {
        adp?: Array<{
          metrics?: Array<{ other?: { type?: string; content?: { options?: Array<Record<string, string>> } } }>;
        }>;
      };
    };
    for (const a of json.containers?.adp ?? []) {
      for (const metric of a.metrics ?? []) {
        const opts = metric.other?.type === 'ssvc' ? metric.other.content?.options : undefined;
        if (Array.isArray(opts)) {
          const get = (k: string): string | null => {
            for (const o of opts) if (o[k] != null) return o[k]!;
            return null;
          };
          const exploitation = get('Exploitation');
          const automatable = get('Automatable');
          const technical_impact = get('Technical Impact');
          return {
            exploitation,
            automatable,
            technical_impact,
            decision: deriveSsvcDecision(exploitation, automatable, technical_impact),
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function pdCveDetailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cve = (c.req.query('cve') ?? '').trim().toLowerCase();
  if (!CVE_ID_RE.test(cve)) {
    return c.json({ error: 'invalid_cve', detail: 'expected a CVE id like CVE-2024-3400' }, 400, {
      'cache-control': 'no-store',
    });
  }
  const cveUpper = cve.toUpperCase();

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://pd-cvedb-cache.internal/v1/${cveUpper}`);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  let d: CvedbResponse;
  try {
    const res = await fetchResilient(
      `${CVEDB_BASE}/${cveUpper}`,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 2, timeoutMs: 12_000 }
    );
    if (res.status === 404) {
      return c.json({ error: 'not_found', cve: cveUpper }, 404, { 'cache-control': 'no-store' });
    }
    if (!res.ok) {
      return c.json({ error: `cvedb upstream ${res.status}`, cve: cveUpper }, 502, { 'cache-control': 'no-store' });
    }
    d = (await res.json()) as CvedbResponse;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'cvedb unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }

  // CISA Vulnrichment SSVC (optional — null when CISA hasn't enriched the CVE).
  const ssvc = await fetchSsvc(cveUpper);

  const response = new Response(
    JSON.stringify({
      cve: cveUpper,
      generated_at: new Date().toISOString(),
      summary: d.summary ?? null,
      cvss: typeof d.cvss_v3 === 'number' ? d.cvss_v3 : typeof d.cvss === 'number' ? d.cvss : null,
      epss: typeof d.epss === 'number' ? d.epss : null,
      epss_percentile: typeof d.ranking_epss === 'number' ? d.ranking_epss : null,
      kev: d.kev === true,
      propose_action: d.propose_action ?? null,
      ransomware_campaign: d.ransomware_campaign ?? null,
      published: d.published_time ?? null,
      cpes: Array.isArray(d.cpes) ? d.cpes.slice(0, 40) : [],
      references: Array.isArray(d.references) ? d.references.slice(0, 20) : [],
      ssvc,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CVEDB_CACHE_TTL}` },
    }
  );
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
