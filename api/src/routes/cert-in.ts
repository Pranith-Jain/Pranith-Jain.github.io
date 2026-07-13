import type { Context } from 'hono';
import type { Env } from '../env';

interface CertInAdvisory {
  id: string;
  published_at: string;
  severity: string;
  cves: string[];
  products_affected: string[];
  description: string;
  detail_url: string;
  summary: string;
  indexed_at: string;
}

interface CertInResponse {
  total: number;
  advisories: CertInAdvisory[];
  generated_at: string;
  source: string;
  query?: {
    q?: string;
    cve?: string;
    year?: string;
    severity?: string;
    id?: string;
    limit?: number;
  };
}

const INDEX_ASSETS_PATH = '/data/cert-in/index.json';

async function loadIndex(env: { ASSETS?: Fetcher }): Promise<CertInAdvisory[]> {
  if (!env.ASSETS) throw new Error('ASSETS binding missing on cert-in route');
  const url = new URL('https://placeholder');
  url.pathname = INDEX_ASSETS_PATH;
  const r = await env.ASSETS.fetch(new Request(url));
  if (!r.ok) {
    throw new Error(`ASSETS fetch failed: ${r.status} for ${INDEX_ASSETS_PATH}`);
  }
  const data = (await r.json()) as CertInAdvisory[];
  if (!Array.isArray(data)) {
    throw new Error('cert-in index is not an array');
  }
  return data;
}

export async function certInHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q')?.trim();
  const cve = c.req.query('cve')?.trim().toUpperCase();
  const year = c.req.query('year')?.trim();
  const severity = c.req.query('severity')?.trim().toLowerCase();
  const id = c.req.query('id')?.trim().toUpperCase();
  const limitRaw = c.req.query('limit');

  try {
    let advisories: CertInAdvisory[] = await loadIndex(c.env);

    if (id) {
      advisories = advisories.filter((a) => a.id.toUpperCase() === id);
    }

    if (cve) {
      advisories = advisories.filter((a) => a.cves.includes(cve));
    }

    if (severity) {
      advisories = advisories.filter((a) => a.severity === severity);
    }

    if (year) {
      advisories = advisories.filter((a) => a.id.startsWith(`CIAD-${year}-`));
    }

    if (q) {
      const qLower = q.toLowerCase();
      advisories = advisories.filter((a) => {
        if (a.id.toLowerCase().includes(qLower)) return true;
        if (a.description.toLowerCase().includes(qLower)) return true;
        if (a.summary.toLowerCase().includes(qLower)) return true;
        if (a.products_affected.some((p) => p.toLowerCase().includes(qLower))) return true;
        if (a.cves.some((v) => v.toLowerCase().includes(qLower))) return true;
        return false;
      });
    }

    advisories = advisories.sort((a, b) => {
      const aDate = a.published_at || '';
      const bDate = b.published_at || '';
      if (aDate && bDate) return bDate.localeCompare(aDate);
      return b.id.localeCompare(a.id);
    });

    let limit: number | undefined;
    if (limitRaw) {
      const n = parseInt(limitRaw, 10);
      if (!Number.isNaN(n) && n > 0) limit = Math.min(n, 200);
    }
    if (limit) advisories = advisories.slice(0, limit);

    const query: NonNullable<CertInResponse['query']> = {};
    if (q) query.q = q;
    if (cve) query.cve = cve;
    if (year) query.year = year;
    if (severity) query.severity = severity;
    if (id) query.id = id;
    if (limit) query.limit = limit;

    const response: CertInResponse = {
      total: advisories.length,
      advisories,
      generated_at: new Date().toISOString(),
      source: 'https://www.cert-in.org.in/',
      ...(Object.keys(query).length > 0 && { query }),
    };

    return c.json(response, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json(
      {
        error: 'CERT-In lookup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
