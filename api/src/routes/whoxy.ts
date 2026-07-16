import { Hono } from 'hono';
import type { Env } from '../env';

const WHOXY_BASE = 'https://api.whoxy.com';

export const whoxyRouter = new Hono<{ Bindings: Env }>();

whoxyRouter.get('/whoxy/reverse', async (c) => {
  const query = c.req.query('q');
  const searchType = (c.req.query('type') ?? 'email') as 'email' | 'name' | 'company' | 'keyword';

  if (!query || !query.trim()) {
    return c.json({ error: 'missing_query', message: 'Provide ?q=<search term>' }, 400);
  }

  if (!['email', 'name', 'company', 'keyword'].includes(searchType)) {
    return c.json({ error: 'invalid_type', message: 'type must be email, name, company, or keyword' }, 400);
  }

  const apiKey = c.env.WHOXY_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'not_configured', message: 'WHOXY_API_KEY not set' }, 503);
  }

  const identifierParam = searchType === 'keyword' ? 'keyword' : searchType;
  const url = `${WHOXY_BASE}/?key=${apiKey}&reverse=whois&${identifierParam}=${encodeURIComponent(query.trim())}`;

  try {
    const t0 = Date.now();
    let page = 1;
    let totalPages = 1;
    let totalResults = 0;
    const allDomains: Array<{
      domain_name: string;
      registrant_name?: string;
      company_name?: string;
      registrant_email?: string;
      creation_date?: string;
      expiry_date?: string;
    }> = [];

    while (page <= totalPages && page <= 100) {
      const pageUrl = page === 1 ? url : `${url}&page=${page}`;
      const res = await fetch(pageUrl, { signal: AbortSignal.timeout(10_000) });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        return c.json(
          {
            success: false,
            query,
            search_type: searchType,
            error: `whoxy returned ${res.status}: ${errBody.slice(0, 200)}`,
          },
          502
        );
      }

      const body = (await res.json()) as {
        status: number;
        total_results?: number;
        total_pages?: number;
        search_result?: Array<{
          domain_name: string;
          registrant_name?: string;
          company_name?: string;
          registrant_email?: string;
          creation_date?: string;
          expiry_date?: string;
        }>;
        result?: Array<{
          domain_name: string;
          registrant_name?: string;
          company_name?: string;
          registrant_email?: string;
          creation_date?: string;
          expiry_date?: string;
        }>;
        message?: string;
      };

      if (body.status !== 1) {
        return c.json(
          { success: false, query, search_type: searchType, error: body.message ?? 'whoxy returned status=0' },
          502
        );
      }

      allDomains.push(...(body.search_result ?? body.result ?? []));
      totalResults = body.total_results ?? allDomains.length;
      totalPages = body.total_pages ?? 1;
      page++;
    }

    return c.json({
      success: true,
      query,
      search_type: searchType,
      total_results: totalResults,
      domains: allDomains,
      pages_fetched: Math.min(page - 1, totalPages),
      elapsed_ms: Date.now() - t0,
    });
  } catch (e) {
    return c.json(
      { success: false, query, search_type: searchType, error: e instanceof Error ? e.message : String(e) },
      502
    );
  }
});
