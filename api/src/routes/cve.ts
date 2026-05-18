import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { CVE_ACTORS } from '../lib/cve-actor-mapping';

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;

const NVD_UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';

// Module-level in-memory cache for KEV data (per-isolate, ~1hr TTL)
let kevCache: { data: CisaKevVuln[]; expiresAt: number } | null = null;

/** Reset KEV cache — for testing only */
export function __resetKevCache(): void {
  kevCache = null;
}

interface CisaKevVuln {
  cveID: string;
  dateAdded: string;
  vulnerabilityName: string;
  requiredAction: string;
  dueDate: string;
  /** 'Known' when CISA has tied this CVE to a known ransomware campaign. */
  knownRansomwareCampaignUse?: string;
}

interface NvdCvssMetric {
  cvssData: {
    version: string;
    baseScore: number;
    baseSeverity?: string;
    vectorString: string;
  };
}

interface NvdCve {
  id: string;
  published?: string;
  lastModified?: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: NvdCvssMetric[];
    cvssMetricV30?: NvdCvssMetric[];
    cvssMetricV2?: NvdCvssMetric[];
  };
  weaknesses?: Array<{ description: Array<{ lang: string; value: string }> }>;
  references?: Array<{ url: string; tags?: string[] }>;
  configurations?: Array<{
    nodes?: Array<{
      cpeMatch?: Array<{ criteria: string; vulnerable?: boolean }>;
    }>;
  }>;
}

export interface CveLookupResponse {
  cve_id: string;
  published?: string;
  last_modified?: string;
  description?: string;
  cvss?: {
    version: '3.1' | '3.0' | '2.0';
    base_score: number;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    vector: string;
  };
  cwe?: string[];
  references?: Array<{ url: string; tags?: string[] }>;
  affected_products?: string[];
  kev: {
    in_kev: boolean;
    date_added?: string;
    vulnerability_name?: string;
    required_action?: string;
    due_date?: string;
    /** True when CISA marks this CVE as used in known ransomware campaigns. */
    known_ransomware?: boolean;
  };
  epss?: { score: number; percentile: number; date: string };
  /** Public exploit / PoC repos (nomi-sec PoC-in-GitHub) — real-world weaponisation signal. */
  poc?: { count: number; urls: string[] };
  /** GitHub Advisory Database cross-reference (OSS impact). */
  ghsa?: { id: string; severity?: string; url: string };
  /** Which upstream supplied the core record — 'nvd' or 'circl' (NVD fallback). */
  source?: 'nvd' | 'circl';
  /** Named threat-actor / ransomware groups observed exploiting this CVE
   *  (curated cve-actor-mapping) — attribution beyond CISA's binary KEV flag. */
  actors?: string[];
}

/** CIRCL cve-search returns a CVE 5.1 record — extract the fields we need so a
 *  lookup still succeeds when NVD edge-blocks/throttles (the recurring pain). */
function circlToFields(doc: Record<string, unknown>): {
  cvss?: CveLookupResponse['cvss'];
  description?: string;
  cwe: string[];
  published?: string;
  references: Array<{ url: string }>;
} {
  const containers = (doc.containers ?? {}) as Record<string, unknown>;
  const cna = (containers.cna ?? {}) as Record<string, unknown>;
  const adp = Array.isArray(containers.adp) ? (containers.adp as Record<string, unknown>[]) : [];
  const metricSources = [cna, ...adp];
  let cvss: CveLookupResponse['cvss'] | undefined;
  for (const src of metricSources) {
    for (const m of (src.metrics as Record<string, unknown>[]) ?? []) {
      const v = (m.cvssV3_1 ?? m.cvssV3_0) as
        | { baseScore?: number; baseSeverity?: string; vectorString?: string }
        | undefined;
      if (v?.baseScore != null) {
        // Normalize to the response contract's enum. CIRCL/CVSS can emit
        // "NONE" (and odd casing); never cast an out-of-range string as the
        // union — derive from baseScore when baseSeverity isn't one of the 4.
        const sevRaw = String(v.baseSeverity ?? '').toUpperCase();
        const sev: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).includes(
          sevRaw as 'CRITICAL'
        )
          ? (sevRaw as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')
          : v.baseScore >= 9
            ? 'CRITICAL'
            : v.baseScore >= 7
              ? 'HIGH'
              : v.baseScore >= 4
                ? 'MEDIUM'
                : 'LOW';
        cvss = {
          version: m.cvssV3_1 ? '3.1' : '3.0',
          base_score: v.baseScore,
          severity: sev,
          vector: v.vectorString ?? '',
        };
        break;
      }
    }
    if (cvss) break;
  }
  const descriptions = (cna.descriptions as { lang?: string; value?: string }[]) ?? [];
  const description = descriptions.find((d) => (d.lang ?? '').startsWith('en'))?.value;
  const cwe = [
    ...new Set(
      ((cna.problemTypes as { descriptions?: { cweId?: string }[] }[]) ?? [])
        .flatMap((p) => p.descriptions ?? [])
        .map((d) => d.cweId)
        .filter((x): x is string => /^CWE-\d+$/.test(String(x)))
    ),
  ];
  const meta = (doc.cveMetadata ?? {}) as { datePublished?: string };
  const references = ((cna.references as { url?: string }[]) ?? [])
    .map((r) => ({ url: String(r.url ?? '') }))
    .filter((r) => r.url);
  return { cvss, description, cwe, published: meta.datePublished, references };
}

async function fetchKev(): Promise<CisaKevVuln[]> {
  const now = Date.now();
  if (kevCache && kevCache.expiresAt > now) {
    return kevCache.data;
  }
  try {
    const r = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
      headers: { 'User-Agent': NVD_UA },
    });
    if (!r.ok) return kevCache?.data ?? [];
    const json = (await r.json()) as { vulnerabilities?: CisaKevVuln[] };
    const data = json.vulnerabilities ?? [];
    kevCache = { data, expiresAt: now + 3600_000 };
    return data;
  } catch {
    return kevCache?.data ?? [];
  }
}

function parseCvss(cve: NvdCve): CveLookupResponse['cvss'] | undefined {
  const v31 = cve.metrics?.cvssMetricV31?.[0];
  if (v31) {
    return {
      version: '3.1',
      base_score: v31.cvssData.baseScore,
      severity: (v31.cvssData.baseSeverity ?? 'LOW') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      vector: v31.cvssData.vectorString,
    };
  }
  const v30 = cve.metrics?.cvssMetricV30?.[0];
  if (v30) {
    return {
      version: '3.0',
      base_score: v30.cvssData.baseScore,
      severity: (v30.cvssData.baseSeverity ?? 'LOW') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      vector: v30.cvssData.vectorString,
    };
  }
  const v2 = cve.metrics?.cvssMetricV2?.[0];
  if (v2) {
    return {
      version: '2.0',
      base_score: v2.cvssData.baseScore,
      severity: (v2.cvssData.baseSeverity ?? 'LOW') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      vector: v2.cvssData.vectorString,
    };
  }
  return undefined;
}

export async function cveSearchHandler(c: Context<{ Bindings: Env }>) {
  const id = c.req.query('id');

  if (!id) {
    return c.json({ error: 'missing_id', message: 'Provide ?id=CVE-YYYY-NNNN' }, 400);
  }

  if (!CVE_RE.test(id)) {
    return c.json({ error: 'invalid_id', message: 'CVE id must match CVE-YYYY-NNNN[NNN]' }, 400);
  }

  const cveId = id.toUpperCase();

  // Fetch NVD, KEV, and EPSS concurrently
  const nvdUrl = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`;
  const epssUrl = `https://api.first.org/data/v1/epss?cve=${cveId}`;

  // Edge-cache the assembled answer (6h) keyed by CVE id. Cuts upstream
  // load, speeds the CVE Prioritizer's bulk mode, and keeps the
  // unauthenticated GitHub-advisories call well under 60/hr.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://cve-lookup-cache.internal/v2?id=${cveId}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const pocUrl = `https://poc-in-github.motikan2010.net/api/v1/?cve_id=${cveId}`;
  const ghsaUrl = `https://api.github.com/advisories?cve_id=${cveId}&per_page=1`;
  const circlUrl = `https://cve.circl.lu/api/cve/${cveId}`;

  const [nvdRes, epssRes, kevVulns, pocRes, ghsaRes, circlRes] = await Promise.all([
    fetchResilient(nvdUrl, { headers: { 'User-Agent': NVD_UA } }, { attempts: 2, timeoutMs: 8000 }).catch(() => null),
    fetchResilient(epssUrl, { headers: { 'User-Agent': NVD_UA } }, { attempts: 2, timeoutMs: 6000 }).catch(() => null),
    fetchKev(),
    fetch(pocUrl, { headers: { 'User-Agent': NVD_UA }, signal: AbortSignal.timeout(7000) }).catch(() => null),
    fetch(ghsaUrl, {
      headers: { 'User-Agent': NVD_UA, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(7000),
    }).catch(() => null),
    // CIRCL is the NVD fallback — NOT behind the Akamai/throttle wall that
    // blocks services.nvd.nist.gov from the shared Worker egress IP.
    fetch(circlUrl, { headers: { 'User-Agent': NVD_UA }, signal: AbortSignal.timeout(8000) }).catch(() => null),
  ]);

  // Core record: NVD first, CIRCL on any NVD failure/miss. Only error if BOTH
  // are unavailable — a single source outage no longer breaks the lookup.
  let description: string | undefined;
  let cvss: CveLookupResponse['cvss'] | undefined;
  let cwe: string[] = [];
  let references: Array<{ url: string; tags?: string[] }> = [];
  let affected_products: string[] = [];
  let published: string | undefined;
  let lastModified: string | undefined;
  let source: 'nvd' | 'circl' = 'nvd';

  let nvdCve: NvdCve | null = null;
  if (nvdRes && nvdRes.ok) {
    try {
      const nvdBody = (await nvdRes.json()) as { totalResults: number; vulnerabilities: Array<{ cve: NvdCve }> };
      nvdCve = nvdBody.totalResults && nvdBody.vulnerabilities?.[0] ? nvdBody.vulnerabilities[0].cve : null;
    } catch {
      nvdCve = null;
    }
  }

  if (nvdCve) {
    const cve = nvdCve;
    description = cve.descriptions?.find((d) => d.lang === 'en')?.value;
    cvss = parseCvss(cve);
    cwe = [
      ...new Set(
        (cve.weaknesses ?? [])
          .flatMap((w) => w.description.filter((d) => d.lang === 'en').map((d) => d.value))
          .filter((v) => /^CWE-\d+$/.test(v))
      ),
    ];
    references = (cve.references ?? []).map((r) => ({ url: r.url, ...(r.tags ? { tags: r.tags } : {}) }));
    const allCpe = (cve.configurations ?? [])
      .flatMap((cfg) => cfg.nodes ?? [])
      .flatMap((node) => node.cpeMatch ?? [])
      .map((m) => m.criteria)
      .filter(Boolean);
    affected_products = [...new Set(allCpe)].slice(0, 10);
    published = cve.published;
    lastModified = cve.lastModified;
  } else if (circlRes && circlRes.ok) {
    try {
      const cf = circlToFields((await circlRes.json()) as Record<string, unknown>);
      description = cf.description;
      cvss = cf.cvss;
      cwe = cf.cwe;
      references = cf.references;
      published = cf.published;
      source = 'circl';
    } catch {
      /* fall through to the both-failed error below */
    }
  }

  if (!description && !cvss && source === 'nvd' && !nvdCve) {
    // Neither NVD nor CIRCL produced a record.
    const reason = !nvdRes && !circlRes ? 'NVD and CIRCL both unreachable' : `${cveId} not found in NVD or CIRCL`;
    return c.json({ error: 'unavailable', message: reason }, !nvdRes && !circlRes ? 502 : 404);
  }

  // KEV cross-reference
  const kevMatch = kevVulns.find((v) => v.cveID === cveId);
  const kev: CveLookupResponse['kev'] = kevMatch
    ? {
        in_kev: true,
        date_added: kevMatch.dateAdded,
        vulnerability_name: kevMatch.vulnerabilityName,
        required_action: kevMatch.requiredAction,
        due_date: kevMatch.dueDate,
        known_ransomware: kevMatch.knownRansomwareCampaignUse === 'Known',
      }
    : { in_kev: false };

  // EPSS
  let epss: CveLookupResponse['epss'] | undefined;
  if (epssRes?.ok) {
    try {
      const epssBody = (await epssRes.json()) as {
        data?: Array<{ cve: string; epss: number; percentile: number; date: string }>;
      };
      const epssEntry = epssBody.data?.[0];
      if (epssEntry) {
        epss = { score: epssEntry.epss, percentile: epssEntry.percentile, date: epssEntry.date };
      }
    } catch {
      // EPSS is optional — silently ignore parse errors
    }
  }

  // Public PoC repos (nomi-sec) — real-world weaponisation signal.
  let poc: CveLookupResponse['poc'] | undefined;
  if (pocRes?.ok) {
    try {
      const pb = (await pocRes.json()) as { pocs?: Array<{ html_url?: string; full_name?: string }> };
      const repos = pb.pocs ?? [];
      if (repos.length > 0)
        poc = {
          count: repos.length,
          urls: repos
            .slice(0, 5)
            .map((r) => r.html_url || (r.full_name ? `https://github.com/${r.full_name}` : ''))
            .filter(Boolean),
        };
    } catch {
      /* PoC feed optional */
    }
  }

  // GitHub Advisory Database cross-reference (OSS impact).
  let ghsa: CveLookupResponse['ghsa'] | undefined;
  if (ghsaRes?.ok) {
    try {
      const gb = (await ghsaRes.json()) as Array<{ ghsa_id?: string; severity?: string; html_url?: string }>;
      const g = Array.isArray(gb) ? gb[0] : undefined;
      if (g?.ghsa_id)
        ghsa = { id: g.ghsa_id, severity: g.severity, url: g.html_url ?? `https://github.com/advisories/${g.ghsa_id}` };
    } catch {
      /* GHSA optional */
    }
  }

  const body: CveLookupResponse = {
    cve_id: cveId,
    ...(published ? { published } : {}),
    ...(lastModified ? { last_modified: lastModified } : {}),
    ...(description ? { description } : {}),
    ...(cvss ? { cvss } : {}),
    ...(cwe.length ? { cwe } : {}),
    ...(references.length ? { references } : {}),
    ...(affected_products.length ? { affected_products } : {}),
    kev,
    ...(epss ? { epss } : {}),
    ...(poc ? { poc } : {}),
    ...(ghsa ? { ghsa } : {}),
    ...(CVE_ACTORS[cveId]?.length ? { actors: CVE_ACTORS[cveId] } : {}),
    source,
  };

  const res = c.json(body, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
