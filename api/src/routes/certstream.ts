import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * CertStream-style live Certificate Transparency feed.
 *
 * Polls crt.sh's JSON endpoint for certificates matching a keyword and
 * returns only entries newer than the caller's high-water mark (`since`).
 * The browser uses that to ticker-append, giving the same "live stream"
 * UX as CertStream's WebSocket firehose without holding a long-lived
 * connection from the Worker.
 *
 * Why keyword-filtered, not firehose: a true CT firehose is ~100 certs/s
 * across all logs — useless without a target. A keyword (brand name,
 * apex domain, lookalike root) is what defenders actually want to watch
 * for typosquats and impersonation issuances as they happen.
 */

const FETCH_TIMEOUT = 12_000;
const EDGE_TTL = 30; // crt.sh re-indexes ~every 30-60s; short edge cache OK
const STALE_FALLBACK_TTL = 30 * 60; // 30 min — used only when crt.sh is 502'ing
const CRTSH_BASE = 'https://crt.sh/';
const CERTSPOTTER_BASE = 'https://api.certspotter.com/v1/issuances';
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const MAX_KEYWORD_LEN = 64;
const KEYWORD_RE = /^[A-Za-z0-9._%*-]+$/; // SQL-safe-ish + crt.sh wildcards
const HARD_RESULT_CAP = 100;
const RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [400, 1_000, 2_500, 5_000, 9_000];

interface CrtshRow {
  issuer_ca_id?: number;
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  id?: number;
  entry_timestamp?: string;
  not_before?: string;
  not_after?: string;
  serial_number?: string;
}

export interface CertStreamItem {
  id: number;
  common_name: string;
  dns_names: string[];
  issuer: string;
  entry_timestamp: string;
  not_before?: string;
  not_after?: string;
  crtsh_url: string;
}

export interface CertStreamResponse {
  keyword: string;
  since: number;
  high_water: number;
  total: number;
  items: CertStreamItem[];
  source: string;
  source_url: string;
  generated_at: string;
  /** Set when crt.sh is failing and we're serving stale or empty. */
  upstream_error?: string;
}

function pickIssuerShort(name: string | undefined): string {
  if (!name) return 'unknown';
  const m = name.match(/O\s*=\s*"?([^",]+)"?/);
  if (m && m[1]) return m[1].trim();
  const cn = name.match(/CN\s*=\s*"?([^",]+)"?/);
  return cn?.[1]?.trim() ?? 'unknown';
}

function dedupeDnsNames(raw: string | undefined, fallback: string | undefined): string[] {
  const lines = (raw ?? fallback ?? '')
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(lines)).slice(0, 20);
}

export async function certStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const keyword = (c.req.query('keyword') ?? c.req.query('q') ?? '').trim();
  if (!keyword) return c.json({ error: 'missing keyword' }, 400);
  if (keyword.length > MAX_KEYWORD_LEN) {
    return c.json({ error: `keyword too long (max ${MAX_KEYWORD_LEN})` }, 400);
  }
  if (!KEYWORD_RE.test(keyword)) {
    return c.json({ error: 'invalid keyword (letters, digits, . _ - % * only)' }, 400);
  }
  const sinceRaw = Number(c.req.query('since') ?? '0');
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://certstream-cache.internal/v1?k=${encodeURIComponent(keyword)}&s=${since}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  // Per-keyword "last known good" cache — independent of `since` so it
  // survives a 502 even when the watermark has advanced. We fall back to
  // this only when crt.sh is genuinely down; on success we overwrite it.
  const stableCacheKey = new Request(`https://certstream-cache.internal/stable?k=${encodeURIComponent(keyword)}`);

  // crt.sh supports both `%word%` substring and bare `Identity=` matches.
  // We pass the keyword verbatim — the caller decides whether to include
  // wildcards. This keeps the contract simple and predictable.
  const upstream = `${CRTSH_BASE}?q=${encodeURIComponent(keyword)}&output=json`;

  let rows: CrtshRow[] = [];
  let lastError = '';
  let succeeded = false;
  // crt.sh's nginx 502s under load — usually clears in seconds. Retry
  // before falling back to stale, so most callers never see a 502.
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(upstream, {
        signal: ctrl.signal,
        headers: { accept: 'application/json', 'user-agent': 'pranithjain-certstream/1.0' },
      });
      clearTimeout(timer);
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        lastError = `crt.sh HTTP ${res.status} (nginx overloaded)`;
        if (attempt < RETRY_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
          continue;
        }
        break;
      }
      if (!res.ok) {
        lastError = `crt.sh HTTP ${res.status}`;
        break;
      }
      const text = await res.text();
      if (!text.trim().startsWith('[')) {
        lastError = 'crt.sh returned non-JSON (overloaded)';
        if (attempt < RETRY_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
          continue;
        }
        break;
      }
      rows = JSON.parse(text) as CrtshRow[];
      succeeded = true;
      break;
    } catch (e) {
      lastError = `crt.sh fetch failed: ${(e as Error).message}`;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
        continue;
      }
    }
  }

  if (!succeeded) {
    // Secondary upstream — Cert Spotter (SSLMate). Only usable when the
    // keyword is a domain (Cert Spotter doesn't accept SQL-style wildcard
    // patterns), so this fallback applies to brand-watch use cases like
    // `keyword=anthropic.com`. For wildcard patterns (`%anthrop%`) we
    // skip and fall through to the stale-cache path below.
    const lower = keyword.toLowerCase();
    const looksLikeDomain = !lower.includes('%') && !lower.includes('*') && DOMAIN_RE.test(lower);
    if (looksLikeDomain) {
      const csUrl = `${CERTSPOTTER_BASE}?domain=${encodeURIComponent(lower)}&include_subdomains=true&expand=dns_names&expand=issuer`;
      try {
        const csRes = await fetch(csUrl, {
          headers: { accept: 'application/json', 'user-agent': 'pranithjain-certstream-fallback/1.0' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
        if (csRes.ok) {
          const csRaw = (await csRes.json()) as Array<{
            id?: string;
            dns_names?: string[];
            issuer?: { friendly_name?: string };
            not_before?: string;
            not_after?: string;
          }>;
          const csItems: CertStreamItem[] = (Array.isArray(csRaw) ? csRaw : [])
            // Cert Spotter IDs are opaque strings; map to numeric high-water
            // by hashing so the FE de-dup logic still works. Hash collisions
            // are vanishingly rare in this dataset.
            .map((r) => {
              const id =
                typeof r.id === 'string'
                  ? r.id.split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0) >>> 0
                  : 0;
              return {
                id,
                common_name: (r.dns_names?.[0] ?? '').toLowerCase(),
                dns_names: (r.dns_names ?? []).slice(0, 20),
                issuer: r.issuer?.friendly_name ?? 'unknown',
                entry_timestamp: r.not_before ?? '',
                not_before: r.not_before,
                not_after: r.not_after,
                crtsh_url: `https://sslmate.com/certspotter/api/v1/issuances?domain=${encodeURIComponent(lower)}`,
              };
            })
            .filter((it) => it.id > since)
            .sort((a, b) => b.id - a.id)
            .slice(0, HARD_RESULT_CAP);
          if (csItems.length > 0) {
            // Don't surface upstream_error here — certspotter IS serving
            // successfully, so the FE shouldn't show a "degraded" banner.
            // The `source` string changes so analysts can still see which
            // upstream they're reading from, but it's not an error state.
            return c.json(
              {
                keyword,
                since,
                high_water: csItems[0]!.id,
                total: csItems.length,
                items: csItems,
                source: 'certspotter (crt.sh unavailable)',
                source_url: csUrl,
                generated_at: new Date().toISOString(),
              },
              200,
              { 'Cache-Control': `public, max-age=${EDGE_TTL}` }
            );
          }
        }
      } catch {
        /* certspotter also failed; fall through to stale-cache path */
      }
    }

    // Stale-while-error: if we have a recent good response for this keyword,
    // serve it with a banner so the UI can show "upstream degraded" instead
    // of going empty. Better than a hard 502 — the analyst still sees the
    // last batch and the stream resumes automatically when crt.sh recovers.
    const stale = await cache.match(stableCacheKey);
    if (stale) {
      const staleBody = (await stale.clone().json()) as CertStreamResponse;
      // Filter to only items > since (the caller's watermark) so we don't
      // re-deliver. If the watermark already covers stale, return empty
      // with a degraded flag so the page polls again without erroring.
      const items = staleBody.items.filter((it) => it.id > since);
      const response = c.json(
        {
          ...staleBody,
          items,
          high_water: items[0]?.id ?? since,
          source: 'crt.sh (stale — upstream degraded)',
          upstream_error: lastError,
          generated_at: new Date().toISOString(),
        },
        200,
        // Short TTL so the next poll re-tries crt.sh live.
        { 'Cache-Control': 'public, max-age=15' }
      );
      return response;
    }
    // No stale cache to serve. Return 200 with empty items + a soft
    // upstream_error rather than a hard 502 — the page already shows a
    // "degraded" banner for upstream_error, and the next poll will retry
    // crt.sh live. A 502 here would surface as a hard red error in the
    // UI and make the user think the page itself is broken.
    const emptyBody: CertStreamResponse = {
      keyword,
      since,
      high_water: since,
      total: 0,
      items: [],
      source: 'crt.sh (waiting for upstream recovery)',
      source_url: upstream,
      generated_at: new Date().toISOString(),
    };
    return c.json({ ...emptyBody, upstream_error: lastError || 'crt.sh unavailable' }, 200, {
      'Cache-Control': 'public, max-age=10',
    });
  }

  const items: CertStreamItem[] = rows
    .filter((r): r is CrtshRow & { id: number } => typeof r.id === 'number')
    .filter((r) => r.id > since)
    .sort((a, b) => b.id - a.id)
    .slice(0, HARD_RESULT_CAP)
    .map((r) => ({
      id: r.id,
      common_name: (r.common_name ?? '').toLowerCase(),
      dns_names: dedupeDnsNames(r.name_value, r.common_name),
      issuer: pickIssuerShort(r.issuer_name),
      entry_timestamp: r.entry_timestamp ?? '',
      not_before: r.not_before,
      not_after: r.not_after,
      crtsh_url: `https://crt.sh/?id=${r.id}`,
    }));

  const highWater = items.length > 0 ? items[0]!.id : since;

  const body: CertStreamResponse = {
    keyword,
    since,
    high_water: highWater,
    total: items.length,
    items,
    source: 'crt.sh',
    source_url: upstream,
    generated_at: new Date().toISOString(),
  };

  const response = c.json(body, 200, {
    'Cache-Control': `public, max-age=${EDGE_TTL}`,
  });
  // Edge-cache only the empty-delta case heavily — a fresh batch should
  // reach every poller. The header above governs both client & edge TTL.
  await cache.put(cacheKey, response.clone());

  // Refresh the per-keyword stable snapshot so the next 502 can be served
  // from cache instead of erroring. We store the FULL (since=0) view here.
  if (since === 0 && items.length > 0) {
    const stableResponse = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${STALE_FALLBACK_TTL}`,
      },
    });
    c.executionCtx.waitUntil(cache.put(stableCacheKey, stableResponse));
  }
  return response;
}
