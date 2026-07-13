import type { Context } from 'hono';
import type { Env } from '../env';

interface UrlscanResult {
  task?: { url?: string; domain?: string; uuid?: string; screenshotURL?: string };
  page?: {
    url?: string;
    domain?: string;
    ip?: string;
    country?: string;
    server?: string;
    mimeType?: string;
    status?: string;
  };
  result?: string;
  screenshot?: string;
  tags?: string[];
  verdicts?: { overall?: { malicious?: boolean; score?: number } };
}

interface UrlscanSearchResponse {
  total?: number;
  results?: Array<{ _source?: UrlscanResult; sort?: unknown[] }>;
}

export async function urlscanIpHandler(c: Context<{ Bindings: Env }>) {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'missing ip parameter' }, 400);

  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return c.json({ error: 'invalid IP format' }, 400);
  }

  const apiKey = c.env.URLSCAN_API_KEY;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['API-Key'] = apiKey;

  try {
    const q = `ip:${ip}`;
    const url = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=20`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

    if (res.status === 401 || res.status === 403) {
      return c.json({ results: [], total: 0, error: 'URLScan API key required or invalid' }, 200);
    }
    if (!res.ok) {
      return c.json({ error: `URLScan API returned ${res.status}` }, 502);
    }

    const json: UrlscanSearchResponse = await res.json();
    const results = (json.results ?? []).map((r) => {
      const src = r._source ?? {};
      return {
        url: src.task?.url ?? src.page?.url,
        domain: src.task?.domain ?? src.page?.domain,
        screenshot: src.task?.screenshotURL ?? src.screenshot,
        country: src.page?.country,
        server: src.page?.server,
        status: src.page?.status,
        mime: src.page?.mimeType,
        tags: src.tags ?? [],
        malicious: src.verdicts?.overall?.malicious ?? false,
        score: src.verdicts?.overall?.score ?? 0,
        scan_url: src.result,
      };
    });

    return c.json({ ip, total: json.total ?? 0, results });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 502);
  }
}
