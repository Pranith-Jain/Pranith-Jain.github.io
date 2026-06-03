import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * Stop Forum Spam — free IP / email abuse reputation
 * (https://www.stopforumspam.org/usage, no key). Crowdsourced registry of
 * addresses reported for spam/abuse: how often seen, last seen, tor-exit flag,
 * ASN/country, and a confidence score.
 *
 *   GET /api/v1/abuse-rep?ip=<ip>
 *   GET /api/v1/abuse-rep?email=<email>
 *
 * Useful as a quick triage signal alongside the heavier IOC enrichments.
 */

const SFS_BASE = 'https://api.stopforumspam.org/api';
const CACHE_TTL = 3600;

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SfsField {
  appears?: number;
  frequency?: number;
  lastseen?: string;
  confidence?: number;
  torexit?: number;
  asn?: number;
  country?: string;
}
interface SfsResponse {
  success?: number;
  ip?: SfsField;
  email?: SfsField;
}

export async function stopForumSpamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = (c.req.query('ip') ?? '').trim();
  const email = (c.req.query('email') ?? '').trim().toLowerCase();

  let kind: 'ip' | 'email';
  let value: string;
  if (ip) {
    if (!IP_RE.test(ip)) return c.json({ error: 'invalid_ip' }, 400, { 'cache-control': 'no-store' });
    kind = 'ip';
    value = ip;
  } else if (email) {
    if (!EMAIL_RE.test(email)) return c.json({ error: 'invalid_email' }, 400, { 'cache-control': 'no-store' });
    kind = 'email';
    value = email;
  } else {
    return c.json({ error: 'ip or email parameter required' }, 400, { 'cache-control': 'no-store' });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://sfs-cache.internal/v1/${kind}/${encodeURIComponent(value)}`);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  let data: SfsResponse;
  try {
    const res = await fetchResilient(
      `${SFS_BASE}?${kind}=${encodeURIComponent(value)}&json`,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 3, timeoutMs: 12_000 }
    );
    if (!res.ok) return c.json({ error: `stopforumspam upstream ${res.status}` }, 502, { 'cache-control': 'no-store' });
    data = (await res.json()) as SfsResponse;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'stopforumspam unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }

  const field = (kind === 'ip' ? data.ip : data.email) ?? {};
  const appears = typeof field.appears === 'number' ? field.appears : 0;
  const body = {
    kind,
    value,
    generated_at: new Date().toISOString(),
    listed: appears > 0,
    appears,
    frequency: field.frequency ?? 0,
    last_seen: field.lastseen ?? null,
    confidence: typeof field.confidence === 'number' ? field.confidence : null,
    tor_exit: field.torexit === 1,
    asn: field.asn ?? null,
    country: field.country ?? null,
  };

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
