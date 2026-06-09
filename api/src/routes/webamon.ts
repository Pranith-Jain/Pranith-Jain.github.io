import type { Context } from 'hono';
import type { Env } from '../env';

const WEBAMON_SEARCH = 'https://search.webamon.com';
const TIMEOUT = 12_000;
const CACHE_TTL = 300;
const UA = 'pranithjain-dfir/1.0';

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

async function webamonFetch(path: string): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(`${WEBAMON_SEARCH}${path}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': UA },
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

/* ─── Search (public) ───────────────────────────────────────────────────── */

export async function webamonSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const search = c.req.query('search')?.trim();
  if (!search) return c.json({ error: 'missing search query' }, 400);
  const results =
    c.req.query('results') ??
    'domain.name,page_title,meta.risk_score,fingerprint.tech,fingerprint.asn,resolved_url,tag,sub_domain';
  const size = Math.min(Number(c.req.query('size')) || 20, 100);
  const from = Number(c.req.query('from')) || 0;

  const upstream = `/search?search=${encodeURIComponent(search)}&results=${encodeURIComponent(results)}&size=${size}&from=${from}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await webamonFetch(upstream);
    if (res && res.ok) {
      const data = (await res.json()) as WebamonSearchResponse;
      return c.json(data, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
    }
    if (res && res.status !== 429 && res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * attempt));
    } else if (!res && attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * attempt));
    } else {
      return c.json({ error: 'webamon upstream error', upstream_status: res?.status ?? 502 }, 502);
    }
  }
  return c.json({ error: 'webamon upstream error' }, 502);
}

/* ─── Scan (public via search.webamon.com/scan) ──────────────────────────── */

export async function webamonScanHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ submission_url?: string }>().catch(() => ({}));
    if (!body.submission_url) return c.json({ error: 'missing submission_url' }, 400);
    const res = await webamonFetch(`/scan?submission_url=${encodeURIComponent(body.submission_url)}`);
    if (!res) return c.json({ error: 'webamon upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch (err) {
    return c.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'scan handler failed' },
      500
    );
  }
}

/* ─── Report lookup (public, search by report_id) ────────────────────────── */

export async function webamonReportsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const q = c.req.query('q') ?? '';
    const lucene = q ? `&lucene_query=${encodeURIComponent(q)}` : '';
    const res = await webamonFetch(`/search?index=scans${lucene}&size=20`);
    if (!res) return c.json({ error: 'webamon upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch (err) {
    return c.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'reports handler failed' },
      500
    );
  }
}

export async function webamonReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const id = c.req.param('id');
    const res = await webamonFetch(
      `/search?lucene_query=${encodeURIComponent(`report_id:"${id}"`)}&index=scans&fields=domain.name,page_title,report_id,meta,resolved_url,tag,date&size=10`
    );
    if (!res) return c.json({ error: 'webamon upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch (err) {
    return c.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'report handler failed' },
      500
    );
  }
}

/* ─── Screenshot (public via search.webamon.com/screenshot) ──────────────── */

export async function webamonScreenshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const id = c.req.param('id');
    const res = await webamonFetch(`/screenshot?report_id=${encodeURIComponent(id)}`);
    if (!res) return c.json({ error: 'screenshot not found' }, 404);
    const data = await res.json();
    const screenshot = (data as { report?: { screenshot?: string } })?.report?.screenshot;
    if (screenshot) {
      const base64 = screenshot.replace(/^data:image\/\w+;base64,/, '');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
      });
    }
    return c.json({ error: 'no screenshot in response' }, 404);
  } catch (err) {
    return c.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'screenshot handler failed' },
      500
    );
  }
}

/* ─── Infrastructure lookups via public search API ───────────────────────── */

export async function webamonDomainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const name = c.req.param('name');
    const res = await webamonFetch(
      `/search?search=${encodeURIComponent(name)}&results=domain.name,resolved_url,page_title,meta.risk_score,meta.report_id,fingerprint.asn,fingerprint.tech,tag,sub_domain&size=20`
    );
    if (!res) return c.json({ error: 'webamon upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch (err) {
    return c.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'domain handler failed' },
      500
    );
  }
}

export async function webamonServerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const ip = c.req.param('ip');
    const res = await webamonFetch(
      `/search?lucene_query=${encodeURIComponent(`ip:${ip}`)}&index=servers&fields=ip,domain.name&size=20`
    );
    if (!res) return c.json({ error: 'webamon upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch (err) {
    return c.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'server handler failed' },
      500
    );
  }
}

export async function webamonResourceHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const sha256 = c.req.param('sha256');
    const res = await webamonFetch(
      `/search?lucene_query=${encodeURIComponent(`sha256:${sha256}`)}&index=resources&size=20`
    );
    if (!res) return c.json({ error: 'webamon upstream unreachable' }, 502);
    const data = await res.json();
    return c.json(data, res.ok ? 200 : res.status);
  } catch {
    return c.json({ error: 'internal_error', message: 'resource handler failed' }, 500);
  }
}
