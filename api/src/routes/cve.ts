import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';

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
  };
  epss?: { score: number; percentile: number; date: string };
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

  const [nvdRes, epssRes, kevVulns] = await Promise.all([
    fetch(nvdUrl, { headers: { 'User-Agent': NVD_UA } }).catch(() => null),
    fetch(epssUrl, { headers: { 'User-Agent': NVD_UA } }).catch(() => null),
    fetchKev(),
  ]);

  if (!nvdRes) {
    return c.json({ error: 'upstream_error', message: 'Could not reach NVD API' }, 502);
  }

  if (nvdRes.status === 429) {
    return c.json({ error: 'rate_limited', message: 'NVD API is rate-limiting. Retry in 30 seconds.' }, 502);
  }

  if (!nvdRes.ok) {
    return c.json({ error: 'nvd_error', message: `NVD returned ${nvdRes.status}` }, 502);
  }

  let nvdBody: { totalResults: number; vulnerabilities: Array<{ cve: NvdCve }> };
  try {
    nvdBody = (await nvdRes.json()) as typeof nvdBody;
  } catch (err) {
    return c.json({ error: 'parse_error', message: safeErrorMessage(err) }, 502);
  }

  if (!nvdBody.totalResults || !nvdBody.vulnerabilities?.length) {
    return c.json({ error: 'not_found', message: `${cveId} not found in NVD` }, 404);
  }

  const cve = nvdBody.vulnerabilities[0].cve;

  // Description (English)
  const description = cve.descriptions?.find((d) => d.lang === 'en')?.value;

  // CVSS
  const cvss = parseCvss(cve);

  // CWE IDs
  const cwe = [
    ...new Set(
      (cve.weaknesses ?? [])
        .flatMap((w) => w.description.filter((d) => d.lang === 'en').map((d) => d.value))
        .filter((v) => /^CWE-\d+$/.test(v))
    ),
  ];

  // References
  const references = (cve.references ?? []).map((r) => ({ url: r.url, ...(r.tags ? { tags: r.tags } : {}) }));

  // Affected products (CPE criteria, deduped, ≤ 10)
  const allCpe = (cve.configurations ?? [])
    .flatMap((cfg) => cfg.nodes ?? [])
    .flatMap((node) => node.cpeMatch ?? [])
    .map((m) => m.criteria)
    .filter(Boolean);
  const affected_products = [...new Set(allCpe)].slice(0, 10);

  // KEV cross-reference
  const kevMatch = kevVulns.find((v) => v.cveID === cveId);
  const kev: CveLookupResponse['kev'] = kevMatch
    ? {
        in_kev: true,
        date_added: kevMatch.dateAdded,
        vulnerability_name: kevMatch.vulnerabilityName,
        required_action: kevMatch.requiredAction,
        due_date: kevMatch.dueDate,
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

  const body: CveLookupResponse = {
    cve_id: cveId,
    ...(cve.published ? { published: cve.published } : {}),
    ...(cve.lastModified ? { last_modified: cve.lastModified } : {}),
    ...(description ? { description } : {}),
    ...(cvss ? { cvss } : {}),
    ...(cwe.length ? { cwe } : {}),
    ...(references.length ? { references } : {}),
    ...(affected_products.length ? { affected_products } : {}),
    kev,
    ...(epss ? { epss } : {}),
  };

  return c.json(body, 200, {
    'Cache-Control': 'public, max-age=1800, s-maxage=3600',
  });
}
