import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Certificate Transparency log search via SSLMate's Cert Spotter API.
 *
 * Free, no auth, no key. The endpoint is rate-limited per-IP at the
 * SSLMate side (loose; ~100 req/hr in practice), so we cache aggressively
 * at the edge. CT logs are append-only — once an issuance is logged it
 * never disappears — so a 6h cache is fine.
 *
 * Use case: enumerate subdomains a target has issued certificates for.
 * Fast path to find dev/staging/api hosts that don't appear in DNS
 * brute-force wordlists. Pairs with /dfir/domain (zone records),
 * /dfir/exposure (open-port scan), /dfir/takeover (CNAME drift).
 *
 * SSLMate response shape (slim):
 *   [{
 *     id: string, tbs_sha256: string, cert_sha256: string,
 *     dns_names: string[], pubkey_sha256: string,
 *     issuer: { friendly_name: string, ... },
 *     not_before: ISO, not_after: ISO,
 *     revoked: boolean, problem_reporting: ...
 *   }, ...]
 */

const FETCH_TIMEOUT = 12_000;
const CACHE_TTL = 6 * 3600;
const SSLMATE_BASE = 'https://api.certspotter.com/v1/issuances';
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

interface CertSpotterIssuance {
  id?: string;
  tbs_sha256?: string;
  cert_sha256?: string;
  dns_names?: string[];
  pubkey_sha256?: string;
  issuer?: { friendly_name?: string; pubkey_sha256?: string };
  not_before?: string;
  not_after?: string;
  revoked?: boolean;
}

export interface CertSearchResponse {
  domain: string;
  include_subdomains: boolean;
  total: number;
  /** Unique DNS names observed across all issuances. Useful as a subdomain inventory. */
  unique_names: string[];
  /** Distinct issuers, sorted by issuance count desc. */
  issuers: Array<{ name: string; count: number }>;
  /** Top N most-recent issuances (capped at 50). */
  recent: Array<{
    id: string;
    dns_names: string[];
    issuer: string;
    not_before?: string;
    not_after?: string;
    revoked: boolean;
  }>;
  source: string;
  source_url: string;
  generated_at: string;
}

export async function certSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Accept `q` as an alias for `domain` — the page's deep-links and
  // FullSpectrum use ?q=, the form uses ?domain=. One handler, both.
  const domain = (c.req.query('domain') ?? c.req.query('q') ?? '').trim().toLowerCase();
  if (!domain) return c.json({ error: 'missing domain' }, 400);
  if (!DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid domain (expected fqdn like example.com)' }, 400);
  }
  const includeSubdomains = c.req.query('include_subdomains') !== '0';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://cert-search-cache.internal/v1?d=${encodeURIComponent(domain)}&sub=${includeSubdomains ? 1 : 0}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const upstream = `${SSLMATE_BASE}?domain=${encodeURIComponent(domain)}&include_subdomains=${
    includeSubdomains ? 'true' : 'false'
  }&expand=dns_names&expand=issuer`;

  // Cert Spotter's free tier rate-limits the shared CF Worker IP pool; a
  // single 429/5xx used to fail the whole lookup. Retry with backoff
  // (honoring Retry-After, capped) — the per-IP bucket clears fast.
  let raw: CertSpotterIssuance[] = [];
  let lastStatus = 0;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(upstream, {
        signal: ctrl.signal,
        headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      });
      clearTimeout(timer);
      if (res.ok) {
        const parsed = (await res.json()) as CertSpotterIssuance[];
        raw = Array.isArray(parsed) ? parsed : [];
        break;
      }
      lastStatus = res.status;
      // Only 429/5xx are worth retrying; 4xx (bad domain etc.) won't change.
      if (res.status !== 429 && res.status < 500) break;
      if (attempt < MAX_ATTEMPTS) {
        const ra = parseInt(res.headers.get('retry-after') ?? '', 10);
        await new Promise((r) =>
          setTimeout(r, Number.isFinite(ra) ? Math.min(ra * 1000, 3000) : 800 * attempt + Math.random() * 400)
        );
      }
    } catch (e) {
      lastStatus = 0;
      if (e instanceof Error) console.warn(`cert-spotter fetch failed (attempt ${attempt}):`, e.message);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  if (raw.length === 0 && lastStatus !== 0 && lastStatus !== 200) {
    if (lastStatus === 429) {
      return c.json({ error: 'cert-spotter rate-limited upstream — try again shortly', upstream_status: 429 }, 429);
    }
    return c.json({ error: 'cert-spotter upstream error', upstream_status: lastStatus }, 502);
  }

  // Aggregate
  const namesSet = new Set<string>();
  const issuerCounts = new Map<string, number>();
  for (const it of raw) {
    for (const n of it.dns_names ?? []) namesSet.add(n.toLowerCase());
    const issuer = it.issuer?.friendly_name ?? 'unknown';
    issuerCounts.set(issuer, (issuerCounts.get(issuer) ?? 0) + 1);
  }

  // Sort recent issuances by not_before desc, cap at 50.
  const recent = [...raw]
    .sort((a, b) => (b.not_before ?? '').localeCompare(a.not_before ?? ''))
    .slice(0, 50)
    .map((it) => ({
      id: it.id ?? '',
      dns_names: it.dns_names ?? [],
      issuer: it.issuer?.friendly_name ?? 'unknown',
      not_before: it.not_before,
      not_after: it.not_after,
      revoked: Boolean(it.revoked),
    }));

  const body: CertSearchResponse = {
    domain,
    include_subdomains: includeSubdomains,
    total: raw.length,
    unique_names: [...namesSet].sort(),
    issuers: [...issuerCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    recent,
    source: 'SSLMate Cert Spotter',
    source_url: 'https://sslmate.com/certspotter/',
    generated_at: new Date().toISOString(),
  };

  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
