import type { Context } from 'hono';
import type { Env } from '../env';

interface SecurityUpdateEntry {
  id: string;
  vendor: string;
  product: string;
  version?: string;
  cve_ids?: string[];
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  published: string;
  updated: string;
  title: string;
  description: string;
  url: string;
  affected_versions?: string[];
  patched_versions?: string[];
  cvss_score?: number;
}

interface SecurityUpdatesResponse {
  total: number;
  results: SecurityUpdateEntry[];
  query: string;
  vendor?: string;
  source: 'cisa-kev' | 'nvd' | 'vendor-advisories' | 'combined';
  timestamp: string;
}

const API_TIMEOUT = 15000;

const VENDOR_ADVISORIES: Record<string, string> = {
  Microsoft: 'https://api.msrc.microsoft.com/portal/en-us/Updates',
  Cisco: 'https://tools.cisco.com/security/center/publicationListing.x',
  VMware: 'https://www.vmware.com/security/advisories.html',
  RedHat: 'https://access.redhat.com/hydra/rest/securitydata/cve.json',
  Ubuntu: 'https://ubuntu.com/security/notices.json',
  Debian: 'https://security-tracker.debian.org/tracker/data/json',
  Oracle: 'https://www.oracle.com/security-alerts/',
  Adobe: 'https://helpx.adobe.com/security/security-notices.html',
  Mozilla: 'https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox/',
};

/** CISA KEV feed shape (camelCase — verified live 2026-06). */
interface KevFeed {
  vulnerabilities?: Array<{
    cveID?: string;
    vendorProject?: string;
    product?: string;
    vulnerabilityName?: string;
    dateAdded?: string;
    shortDescription?: string;
  }>;
}

/** One record from a VulnCheck index/triage envelope. Fields are read
 *  defensively because VulnCheck's per-index shapes vary. */
interface VcRecord {
  cve?: string;
  id?: string;
  vendor?: string;
  product?: string;
  version?: string;
  severity?: string;
  published?: string;
  date?: string;
  updated?: string;
  title?: string;
  vulnerability?: string;
  description?: string;
  url?: string;
  reference?: string;
  cvss?: number;
}

interface VcTriageEnvelope {
  data?: VcRecord[];
}

function vcRecordToEntry(item: VcRecord, fallbackVendor: string, index: number): SecurityUpdateEntry {
  return {
    id: item.cve || item.id || `vc-${index}`,
    vendor: item.vendor || fallbackVendor,
    product: item.product || '',
    version: item.version,
    cve_ids: item.cve ? [item.cve] : [],
    severity: (item.severity || 'UNKNOWN').toUpperCase() as SecurityUpdateEntry['severity'],
    published: item.published || item.date || new Date().toISOString(),
    updated: item.updated || item.published || new Date().toISOString(),
    title: item.title || item.vulnerability || 'Security Advisory',
    description: item.description || '',
    url: item.url || item.reference || '',
    cvss_score: item.cvss,
  };
}

async function fetchKevUpdates(vendor?: string): Promise<SecurityUpdateEntry[]> {
  try {
    const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
      signal: AbortSignal.timeout(API_TIMEOUT),
      headers: { 'User-Agent': 'pranithjain-dfir/1.0' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as KevFeed;
    const entries: SecurityUpdateEntry[] = [];

    for (const vuln of data.vulnerabilities || []) {
      if (vendor && !vuln.vendorProject?.toLowerCase().includes(vendor.toLowerCase())) continue;

      const cveId = vuln.cveID || '';
      if (!cveId) continue;
      entries.push({
        id: cveId,
        vendor: vuln.vendorProject || 'Unknown',
        product: vuln.product || '',
        severity: vuln.dateAdded ? 'HIGH' : 'UNKNOWN',
        published: vuln.dateAdded || '',
        updated: vuln.dateAdded || '',
        title: vuln.vulnerabilityName || cveId,
        description: vuln.shortDescription || '',
        url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
        cvss_score: undefined,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

async function fetchVendorAdvisories(env: Env, vendor?: string, product?: string): Promise<SecurityUpdateEntry[]> {
  const results: SecurityUpdateEntry[] = [];

  // VulnCheck v3 triage index (auth-gated; base path is /v3, NOT /vulncheck/v3).
  // The token is optional — when unset, or when VulnCheck returns a non-2xx, we
  // degrade cleanly and fall through to the HTML-advisory fallback below.
  const vulncheckToken = env.VULNCHECK_API_TOKEN;
  if (vulncheckToken) {
    try {
      const url = vendor
        ? `https://api.vulncheck.com/v3/triage/vendor/${encodeURIComponent(vendor)}`
        : 'https://api.vulncheck.com/v3/triage/all';
      const res = await fetch(url, {
        signal: AbortSignal.timeout(API_TIMEOUT),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${vulncheckToken}`,
          'User-Agent': 'pranithjain-dfir/1.0',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as VcTriageEnvelope;
        for (const item of data.data || []) {
          if (product && !item.product?.toLowerCase().includes(product.toLowerCase())) continue;
          results.push(vcRecordToEntry(item, item.vendor || vendor || 'Unknown', results.length));
        }
      }
    } catch {
      // VulnCheck failed, continue with the HTML-advisory fallback.
    }
  }

  // Fallback: scrape the vendor's public advisory page for CVE IDs. This is
  // best-effort (HTML layouts drift and most pages are JS-rendered, so it
  // usually yields nothing) — so it is gated to run ONLY for an explicitly
  // requested known vendor whose VulnCheck lookup returned nothing. That caps
  // it at a single extra subrequest instead of fanning out to every vendor.
  if (results.length === 0 && vendor) {
    const v = Object.keys(VENDOR_ADVISORIES).find((k) => k.toLowerCase() === vendor.toLowerCase());
    const url = v ? VENDOR_ADVISORIES[v] : undefined;
    if (v && url) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(API_TIMEOUT * 2),
          headers: { 'User-Agent': 'pranithjain-dfir/1.0' },
        });
        if (res.ok) {
          const text = await res.text();
          const cveMatches = text.match(/CVE-\d{4}-\d{4,7}/gi);
          if (cveMatches) {
            const seen = new Set<string>();
            for (const raw of cveMatches) {
              const cve = raw.toUpperCase();
              if (seen.has(cve)) continue;
              seen.add(cve);
              if (seen.size > 10) break;
              results.push({
                id: cve,
                vendor: v,
                product: product || 'Multiple',
                severity: 'UNKNOWN',
                published: new Date().toISOString(),
                updated: new Date().toISOString(),
                title: `${v} security advisory`,
                description: `See ${url} for details`,
                url,
              });
            }
          }
        }
      } catch {
        // Advisory page unreachable — degrade to whatever we already have.
      }
    }
  }

  return results;
}

export async function securityUpdatesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = (c.req.query('q') ?? '').trim();
  const vendor = c.req.query('vendor')?.trim();
  const product = c.req.query('product')?.trim();

  if (!query && !vendor) {
    return c.json({ error: 'missing query parameter (q or vendor)' }, 400);
  }

  const searchQuery = query || vendor || '';

  try {
    let entries: SecurityUpdateEntry[] = [];

    if (vendor && VENDOR_ADVISORIES[vendor]) {
      entries = await fetchVendorAdvisories(c.env, vendor, product);
    } else if (!vendor) {
      const kevEntries = await fetchKevUpdates();
      entries = kevEntries;
    }

    if (query && !vendor) {
      const vulncheckToken = c.env.VULNCHECK_API_TOKEN;
      if (vulncheckToken) {
        try {
          const res = await fetch(`https://api.vulncheck.com/v3/triage/search?q=${encodeURIComponent(query)}`, {
            signal: AbortSignal.timeout(API_TIMEOUT),
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${vulncheckToken}`,
              'User-Agent': 'pranithjain-dfir/1.0',
            },
          });
          if (res.ok) {
            const data = (await res.json()) as VcTriageEnvelope;
            for (const item of data.data || []) {
              entries.push(vcRecordToEntry(item, item.vendor || 'Unknown', entries.length));
            }
          }
        } catch {
          // Continue with KEV entries
        }
      }
    }

    const kevEntries = await fetchKevUpdates();
    for (const kev of kevEntries) {
      if (!entries.find((e) => e.id === kev.id)) {
        entries.push(kev);
      }
    }

    const uniqueEntries = entries
      .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
      .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())
      .slice(0, 100);

    const response: SecurityUpdatesResponse = {
      total: uniqueEntries.length,
      results: uniqueEntries,
      query: searchQuery,
      vendor,
      source: vendor ? 'vendor-advisories' : 'cisa-kev',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (err) {
    return c.json(
      {
        error: 'Security updates lookup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
