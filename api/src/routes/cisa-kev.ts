import type { Context } from 'hono';
import type { Env } from '../env';

const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NVD_UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
const CVSS_CACHE_KEY = 'cisa-kev-cvss-map';
const CVSS_CACHE_TTL = 21_600;

interface KevVulnerability {
  cve_id: string;
  vendor_project: string;
  product: string;
  vulnerability_name: string;
  date_added: string;
  short_description: string;
  due_date: string;
  known_ransomware_campaign_use: string;
  cvss_score: number | null;
  severity: string | null;
}

interface RawKevVulnerability {
  cveID?: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
  shortDescription?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
}

interface CvssEntry {
  score: number;
  severity: string;
}

interface KevResponse {
  total: number;
  vulnerabilities: KevVulnerability[];
  catalog_version: string;
  date_released: string;
  query?: {
    q?: string;
    cve?: string;
    vendor?: string;
    product?: string;
    days?: number;
    ransomware_only?: boolean;
    severity?: string;
  };
  severity_stats: Record<string, number>;
  timestamp: string;
}

async function loadCvssMap(env: Env): Promise<Map<string, CvssEntry>> {
  const map = new Map<string, CvssEntry>();

  // Check KV cache first
  if (env.KV_CACHE) {
    try {
      const cached = await env.KV_CACHE.get(CVSS_CACHE_KEY, 'json');
      if (cached && typeof cached === 'object') {
        for (const [id, entry] of Object.entries(cached as Record<string, { score: number; severity: string }>)) {
          map.set(id, entry);
        }
        return map;
      }
    } catch {
      // fall through to fetch
    }
  }

  const headers: Record<string, string> = {
    'User-Agent': NVD_UA,
    accept: 'application/json',
  };
  if (env.NVD_API_KEY) headers.apiKey = env.NVD_API_KEY;

  try {
    const url = `${NVD_API}?hasKev=true&resultsPerPage=2000`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });

    if (res.ok) {
      const data = (await res.json()) as {
        vulnerabilities?: Array<{
          cve: {
            id: string;
            metrics?: {
              cvssMetricV31?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
              cvssMetricV30?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
              cvssMetricV2?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
            };
          };
        }>;
      };

      for (const vuln of data.vulnerabilities ?? []) {
        const id = vuln.cve?.id;
        if (!id) continue;
        const metrics = vuln.cve?.metrics;
        const v31 = metrics?.cvssMetricV31?.[0]?.cvssData;
        const v30 = metrics?.cvssMetricV30?.[0]?.cvssData;
        const v2 = metrics?.cvssMetricV2?.[0]?.cvssData;
        const cvss = v31 || v30 || v2;
        if (cvss) {
          map.set(id, { score: cvss.baseScore, severity: cvss.baseSeverity });
        }
      }

      if (env.KV_CACHE) {
        const obj: Record<string, CvssEntry> = {};
        map.forEach((v, k) => {
          obj[k] = v;
        });
        await env.KV_CACHE.put(CVSS_CACHE_KEY, JSON.stringify(obj), { expirationTtl: CVSS_CACHE_TTL });
      }
    }
  } catch (err) {
    console.error('NVD CVSS enrichment failed:', err instanceof Error ? err.message : String(err));
  }

  return map;
}

export async function cisaKevHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q')?.trim();
  const cve = c.req.query('cve')?.trim().toUpperCase();
  const vendor = c.req.query('vendor')?.trim();
  const product = c.req.query('product')?.trim();
  const days = c.req.query('days');
  const ransomwareOnly = c.req.query('ransomware_only') === 'true';
  const severityFilter = c.req.query('severity')?.toLowerCase();

  try {
    const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
      headers: {
        'User-Agent': 'pranithjain-dfir/1.0',
        accept: 'application/json',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return c.json(
        {
          error: 'CISA KEV feed unavailable',
          message: `Upstream returned ${res.status} ${res.statusText}`,
        },
        502,
        { 'Cache-Control': 'no-store' }
      );
    }

    const data = (await res.json()) as {
      catalogVersion?: string;
      dateReleased?: string;
      vulnerabilities?: RawKevVulnerability[];
    };

    // Enrich with NVD CVSS scores (cached)
    const cvssMap = await loadCvssMap(c.env);

    let vulnerabilities: KevVulnerability[] = (data.vulnerabilities || []).map((v) => {
      const nvd = cvssMap.get(v.cveID ?? '');
      const rawSev = nvd?.severity ?? '';
      return {
        cve_id: v.cveID ?? '',
        vendor_project: v.vendorProject ?? '',
        product: v.product ?? '',
        vulnerability_name: v.vulnerabilityName ?? '',
        date_added: v.dateAdded ?? '',
        short_description: v.shortDescription ?? '',
        due_date: v.dueDate ?? '',
        known_ransomware_campaign_use: v.knownRansomwareCampaignUse ?? '',
        cvss_score: nvd?.score ?? null,
        severity: rawSev ? rawSev.charAt(0).toUpperCase() + rawSev.slice(1).toLowerCase() : null,
      };
    });

    if (q) {
      const qLower = q.toLowerCase();
      vulnerabilities = vulnerabilities.filter(
        (v) =>
          v.cve_id.toLowerCase().includes(qLower) ||
          v.vendor_project.toLowerCase().includes(qLower) ||
          v.product.toLowerCase().includes(qLower) ||
          v.vulnerability_name.toLowerCase().includes(qLower)
      );
    }

    if (cve) {
      vulnerabilities = vulnerabilities.filter((v) => v.cve_id.toUpperCase() === cve);
    }

    if (vendor) {
      const vendorLower = vendor.toLowerCase();
      vulnerabilities = vulnerabilities.filter((v) => v.vendor_project.toLowerCase().includes(vendorLower));
    }

    if (product) {
      const productLower = product.toLowerCase();
      vulnerabilities = vulnerabilities.filter((v) => v.product.toLowerCase().includes(productLower));
    }

    if (days) {
      const daysNum = parseInt(days);
      if (!Number.isNaN(daysNum)) {
        const cutoff = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        vulnerabilities = vulnerabilities.filter((v) => v.date_added >= cutoff);
      }
    }

    if (ransomwareOnly) {
      vulnerabilities = vulnerabilities.filter((v) => v.known_ransomware_campaign_use === 'Known');
    }

    if (severityFilter) {
      vulnerabilities = vulnerabilities.filter((v) => v.severity?.toLowerCase() === severityFilter);
    }

    vulnerabilities = vulnerabilities.sort((a, b) => b.date_added.localeCompare(a.date_added));

    const severityStats: Record<string, number> = {};
    for (const v of vulnerabilities) {
      const sev = v.severity || '(none)';
      severityStats[sev] = (severityStats[sev] || 0) + 1;
    }

    const query: NonNullable<KevResponse['query']> = {};
    if (q) query.q = q;
    if (cve) query.cve = cve;
    if (vendor) query.vendor = vendor;
    if (product) query.product = product;
    if (days) {
      const daysNum = parseInt(days);
      if (!Number.isNaN(daysNum)) query.days = daysNum;
    }
    if (ransomwareOnly) query.ransomware_only = true;
    if (severityFilter) query.severity = severityFilter;

    const response: KevResponse = {
      total: vulnerabilities.length,
      vulnerabilities,
      catalog_version: data.catalogVersion ?? '',
      date_released: data.dateReleased ?? '',
      ...(Object.keys(query).length > 0 && { query }),
      severity_stats: severityStats,
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json(
      {
        error: 'CISA KEV lookup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
