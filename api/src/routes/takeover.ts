import type { Context } from 'hono';
import type { Env } from '../env';
import { TAKEOVER_FINGERPRINTS, type TakeoverFingerprint } from '../lib/takeover-fingerprints';
import { assertPublicHost, pinnedFetch, SsrfError } from '../lib/ssrf-guard';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const MAX_CNAME_HOPS = 5;
const FETCH_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

interface TakeoverResult {
  domain: string;
  cname_chain: string[];
  resolves: boolean;
  service?: string;
  vulnerable: boolean;
  evidence?: string;
  recommendation?: string;
  notes: string[];
}

export async function takeoverCheckHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return c.json({ error: 'missing domain' }, 400);
  if (!DOMAIN_RE.test(raw)) return c.json({ error: 'invalid domain' }, 400);

  const result: TakeoverResult = {
    domain: raw,
    cname_chain: [],
    resolves: false,
    vulnerable: false,
    notes: [],
  };

  const chain = await resolveCnameChain(raw);
  result.cname_chain = chain;
  result.resolves = chain.length > 0;

  if (chain.length === 0) {
    result.notes.push('No CNAME chain. NXDOMAIN or apex/A-record only — takeover unlikely via this vector.');
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  const finalCname = chain[chain.length - 1];
  if (!finalCname) {
    result.notes.push('No CNAME chain. NXDOMAIN or apex/A-record only — takeover unlikely via this vector.');
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  }
  const match = TAKEOVER_FINGERPRINTS.find((fp) => fp.cname.test(finalCname));

  if (!match) {
    result.notes.push(`Final CNAME ${finalCname} does not match any known takeover fingerprint.`);
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  result.service = match.service;
  result.recommendation = match.recommendation;

  if (match.fingerprint) {
    // SSRF guard: DOMAIN_RE only checks syntax. A syntactically valid domain
    // can still resolve to localhost / a private / link-local / metadata
    // (169.254.169.254) address, and checkFingerprint() does a live
    // fetch(`${scheme}://${domain}/`). Refuse the active probe for any host
    // that resolves non-publicly — the CNAME-based verdict is still returned.
    const hostCheck = await assertPublicHost(raw);
    if (!hostCheck.ok) {
      result.notes.push(
        `Skipped active fingerprint probe — ${hostCheck.error ?? 'host resolves to a non-public address'}.`
      );
      return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
    }
    const evidence = await checkFingerprint(raw, match);
    if (evidence) {
      result.vulnerable = true;
      result.evidence = evidence;
      result.notes.push(`Fingerprint matched on ${match.service}.`);
    } else {
      result.notes.push(
        `CNAME points to ${match.service}, but the dangling-state fingerprint was not found — service is probably claimed.`
      );
    }
  } else if (match.status) {
    result.vulnerable = true;
    result.notes.push(`CNAME points to ${match.service} (status-based fingerprint).`);
  }

  // 1h edge cache. Vulnerable verdicts also cache — operators want
  // refreshed status anyway via the explorer link, and a vulnerable
  // takeover is a high-confidence finding for that hour.
  return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
}

async function resolveCnameChain(domain: string): Promise<string[]> {
  const chain: string[] = [];
  let current = domain;
  for (let i = 0; i < MAX_CNAME_HOPS; i++) {
    const next = await dohCname(current);
    if (!next) break;
    chain.push(next);
    if (next === current) break;
    current = next;
  }
  return chain;
}

async function dohCname(name: string): Promise<string | null> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=CNAME`, {
      headers: { accept: 'application/dns-json' },
      // DoH endpoint should respond in <100ms; 5s is a generous ceiling.
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { Answer?: { type: number; data?: string }[] };
    const cname = data.Answer?.find((a) => a.type === 5)
      ?.data?.replace(/\.$/, '')
      .toLowerCase();
    return cname ?? null;
  } catch {
    return null;
  }
}

/**
 * Active fingerprint probe with full SSRF protection.
 *
 * `assertPublicHost(domain)` is run by the caller to short-circuit the obvious
 * cases; this function additionally:
 *   1. Uses `pinnedFetch` so the connection is pinned to the IP we validated,
 *      defeating DNS rebinding between check and fetch.
 *   2. Handles redirects manually (`redirect: 'manual'`) and re-runs the
 *      SSRF check on every hop. A 302 to `http://169.254.169.254/...` or
 *      `http://127.0.0.1/...` is rejected, not followed.
 *   3. Caps the redirect chain at MAX_REDIRECTS so a redirect loop can't
 *      stall the worker.
 */
async function checkFingerprint(domain: string, fp: TakeoverFingerprint): Promise<string | null> {
  for (const scheme of ['https', 'http']) {
    try {
      let currentUrl = `${scheme}://${domain}/`;
      let response: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
          response = await pinnedFetch(currentUrl, { signal: ctrl.signal, redirect: 'manual' });
        } catch (e) {
          if (e instanceof SsrfError) break; // redirect into a blocked host → stop, try next scheme
          throw e;
        } finally {
          clearTimeout(t);
        }
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        if (!location) break;
        const next = new URL(location, currentUrl);
        if (next.protocol !== 'http:' && next.protocol !== 'https:') break;
        currentUrl = next.toString();
        // pinnedFetch on the next iteration will re-run assertPublicHost.
      }
      if (!response) continue;

      if (fp.status && response.status === fp.status) return `HTTP ${response.status} on ${scheme}`;
      const body = (await response.text()).slice(0, 16384);
      if (fp.fingerprint && body.includes(fp.fingerprint)) {
        return `Body contains "${fp.fingerprint}" (${scheme})`;
      }
    } catch {
      /* try next scheme */
    }
  }
  return null;
}
