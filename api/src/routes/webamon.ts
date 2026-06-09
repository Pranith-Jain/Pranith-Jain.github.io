import type { Context } from 'hono';
import type { Env } from '../env';
import { authedFetch } from '../lib/webamon-auth';

const WEBAMON_SEARCH = 'https://search.webamon.com/search';
const TIMEOUT = 12_000;
const CACHE_TTL = 300;

interface WebamonResult {
  _index: string;
  'domain.name'?: string;
  date?: string;
  page_title?: string;
  resolved_url?: string;
  sub_domain?: string;
  tag?: string;
  meta?: {
    submission_url?: string;
    script_count?: number;
    risk_score?: number;
    report_id?: string;
    domain_count?: number;
    submission?: string;
    submission_utc?: string;
    request_count?: number;
  };
  fingerprint?: {
    tech?: string;
    scan_fingerprint?: string;
    dom?: string;
    domains?: string;
    links?: string;
    scripts?: string;
    ssl?: string;
    asn?: string;
    cookies?: string;
  };
  matched_fields?: string[];
}

interface WebamonSearchResponse {
  search_string: string;
  fields?: string[];
  total_hits: number;
  results: WebamonResult[];
  pagination: {
    from: number;
    size: number;
    returned: number;
    has_more: boolean;
    current_page: number;
    total_pages: number;
    next_from: number | null;
    prev_from: number | null;
  };
}

/* ─── Public search API (no auth needed) ───────────────────────────────── */

export async function webamonSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const search = c.req.query('search')?.trim();
  if (!search) return c.json({ error: 'missing search query' }, 400);
  const results =
    c.req.query('results') ??
    'domain.name,page_title,meta.risk_score,fingerprint.tech,fingerprint.asn,resolved_url,date,tag,sub_domain';
  const size = Math.min(Number(c.req.query('size')) || 20, 100);
  const from = Number(c.req.query('from')) || 0;

  const upstream = `${WEBAMON_SEARCH}?search=${encodeURIComponent(search)}&results=${encodeURIComponent(results)}&size=${size}&from=${from}`;

  let data: WebamonSearchResponse | null = null;
  let lastStatus = 0;
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
      const res = await fetch(upstream, {
        signal: ctrl.signal,
        headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      });
      clearTimeout(timer);
      if (res.ok) {
        data = (await res.json()) as WebamonSearchResponse;
        break;
      }
      lastStatus = res.status;
      if (res.status !== 429 && res.status < 500) break;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    } catch (e) {
      lastStatus = 0;
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  if (!data) {
    return c.json({ error: 'webamon upstream error', upstream_status: lastStatus || 502 }, 502);
  }

  const response = c.json(data, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  return response;
}

/* ─── Community API helpers (auth required) ────────────────────────────── */

function noAuth(c: Context) {
  return c.json(
    { error: 'Webamon Community API not configured — set WEBAMON_API_KEY via wrangler secret put WEBAMON_API_KEY' },
    503
  );
}

/* POST /api/v1/webamon/scan — submit URL to sandbox */
export async function webamonScanHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const body = await c.req.json<{ submission_url?: string }>().catch(() => ({}));
    if (!body.submission_url) return c.json({ error: 'missing submission_url' }, 400);

    const res = await authedFetch(c.env, '/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submission_url: body.submission_url }),
    });
    if (!res) return c.json({ error: 'webamon auth failed or upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'scan handler failed' }, 500);
  }
}

/* GET /api/v1/webamon/report — search reports */
export async function webamonReportsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const q = c.req.query('q') ?? '';
    const res = await authedFetch(c.env, `/report?urlparams=${encodeURIComponent(q)}`);
    if (!res) return c.json({ error: 'webamon auth failed or upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'report search handler failed' }, 500);
  }
}

/* GET /api/v1/webamon/report/:id — get full report */
export async function webamonReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const id = c.req.param('id');
    const res = await authedFetch(c.env, `/report/${encodeURIComponent(id)}`);
    if (!res) return c.json({ error: 'webamon auth failed or upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'report detail handler failed' }, 500);
  }
}

/* GET /api/v1/webamon/screenshot/:id — get screenshot image */
export async function webamonScreenshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const id = c.req.param('id');
    const res = await authedFetch(c.env, `/screenshot/${encodeURIComponent(id)}`);
    if (!res) return c.json({ error: 'screenshot not found' }, 404);
    const blob = await res.blob();
    return new Response(blob, {
      status: 200,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'image/png',
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch {
    return c.json({ error: 'internal_error', message: 'screenshot handler failed' }, 500);
  }
}

/* GET /api/v1/webamon/domain/:name — domain details */
export async function webamonDomainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const name = c.req.param('name');
    const search = c.req.query('search') ?? '';
    const path = search ? `/domain?urlparams=${encodeURIComponent(search)}` : `/domain/${encodeURIComponent(name)}`;
    const res = await authedFetch(c.env, path);
    if (!res) return c.json({ error: 'webamon auth failed or upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'domain handler failed' }, 500);
  }
}

/* GET /api/v1/webamon/server/:ip — server details */
export async function webamonServerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const ip = c.req.param('ip');
    const search = c.req.query('search') ?? '';
    const path = search ? `/server?urlparams=${encodeURIComponent(search)}` : `/server/${encodeURIComponent(ip)}`;
    const res = await authedFetch(c.env, path);
    if (!res) return c.json({ error: 'webamon auth failed or upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'server handler failed' }, 500);
  }
}

/* GET /api/v1/webamon/resource/:sha256 — resource details */
export async function webamonResourceHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    if (!c.env.WEBAMON_API_KEY) return noAuth(c);
    const sha256 = c.req.param('sha256');
    const search = c.req.query('search') ?? '';
    const path = search ? `/resource?param1=${encodeURIComponent(search)}` : `/resource/${encodeURIComponent(sha256)}`;
    const res = await authedFetch(c.env, path);
    if (!res) return c.json({ error: 'webamon auth failed or upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'resource handler failed' }, 500);
  }
}
