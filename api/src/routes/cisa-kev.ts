import type { Context } from 'hono';
import type { Env } from '../env';

// Output contract (snake_case) consumed by the agent tool/MCP.
interface KevVulnerability {
  cve_id: string;
  vendor_project: string;
  product: string;
  vulnerability_name: string;
  date_added: string;
  short_description: string;
  due_date: string;
  known_ransomware_campaign_use: string;
}

// Raw upstream shape from CISA's KEV feed (camelCase).
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
  };
  timestamp: string;
}

export async function cisaKevHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q')?.trim();
  const cve = c.req.query('cve')?.trim().toUpperCase();
  const vendor = c.req.query('vendor')?.trim();
  const product = c.req.query('product')?.trim();
  const days = c.req.query('days');
  const ransomwareOnly = c.req.query('ransomware_only') === 'true';

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

    // Normalize the camelCase upstream feed into our snake_case output contract ONCE,
    // then filter/sort/return the normalized array.
    let vulnerabilities: KevVulnerability[] = (data.vulnerabilities || []).map((v) => ({
      cve_id: v.cveID ?? '',
      vendor_project: v.vendorProject ?? '',
      product: v.product ?? '',
      vulnerability_name: v.vulnerabilityName ?? '',
      date_added: v.dateAdded ?? '',
      short_description: v.shortDescription ?? '',
      due_date: v.dueDate ?? '',
      known_ransomware_campaign_use: v.knownRansomwareCampaignUse ?? '',
    }));

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

    vulnerabilities = vulnerabilities.sort((a, b) => b.date_added.localeCompare(a.date_added));

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

    const response: KevResponse = {
      total: vulnerabilities.length,
      vulnerabilities,
      catalog_version: data.catalogVersion ?? '',
      date_released: data.dateReleased ?? '',
      ...(Object.keys(query).length > 0 && { query }),
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
