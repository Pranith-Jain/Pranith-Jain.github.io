import type { Context } from 'hono';
import type { Env } from '../env';

const HIBP_RANGE = 'https://api.pwnedpasswords.com/range';
const XON_BASE = 'https://api.xposedornot.com/v1';
const LEAKCHECK_BASE = 'https://leakcheck.io/api/public';
const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';
const PREFIX_RE = /^[A-Fa-f0-9]{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// ─── shared types ────────────────────────────────────────────────────────────

interface BreachEntry {
  name: string;
  domain?: string;
  breach_date?: string;
  description?: string;
  pwn_count?: number;
  data_classes?: string[];
  logo?: string;
}

interface BreachEmailResponse {
  email: string;
  found: boolean;
  source: 'xposedornot' | 'leakcheck' | 'none';
  breach_count: number;
  breaches: BreachEntry[];
}

interface BreachDomainEntry {
  name: string;
  breach_date?: string;
  pwn_count?: number;
  description?: string;
  domain?: string;
  logo?: string;
}

interface BreachDomainResponse {
  domain: string;
  found: boolean;
  source: 'xposedornot' | 'leakcheck' | 'none';
  breach_count: number;
  breaches: BreachDomainEntry[];
}

// ─── XposedOrNot response shapes (actual, verified via live probe) ────────────

interface XonBreachDetail {
  breach: string;
  details: string;
  domain: string;
  industry: string;
  logo: string;
  password_risk: string;
  references: string;
  searchable: string;
  verified: string;
  xposed_data: string; // semicolon-separated
  xposed_date: string; // year as string e.g. "2012"
  xposed_records: number; // already a number (not a string)
  added?: string;
}

interface XonBreachAnalyticsResponse {
  ExposedBreaches: { breaches_details: XonBreachDetail[] } | null;
  BreachesSummary?: { site: string } | null;
  BreachMetrics?: unknown;
  ExposedPastes?: unknown;
}

interface XonDomainBreachEntry {
  breachID: string;
  breachedDate: string;
  addedDate?: string;
  domain: string;
  industry?: string;
  logo?: string;
  passwordRisk?: string;
  searchable?: boolean;
  sensitive?: boolean;
  verified?: boolean;
  exposedData?: string[];
  exposedRecords?: number;
  exposureDescription?: string;
  referenceURL?: string;
}

interface XonDomainResponse {
  status: string;
  message: string | null;
  exposedBreaches: XonDomainBreachEntry[];
}

// ─── LeakCheck response shapes ────────────────────────────────────────────────

interface LeakCheckSource {
  name: string;
  date?: string;
}

interface LeakCheckResponse {
  success: boolean;
  found: number;
  sources?: LeakCheckSource[];
  fields?: string[];
  error?: string;
}

/**
 * Pwned Password k-anonymity proxy.
 *
 * Takes a 5-hex-character prefix of a SHA-1 password hash, queries the HIBP
 * Pwned Passwords range endpoint with `Add-Padding: true` so response sizes
 * can't leak whether a specific suffix matched, and returns the upstream
 * text/plain body unchanged.
 *
 * The user's password never reaches this Worker — only the first 5 chars of
 * its SHA-1 hash. Hashing happens in the browser.
 *
 * Free, no auth required by HIBP.
 */
export async function breachRangeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const prefix = c.req.query('prefix');
  if (!prefix) {
    return c.json({ error: 'missing_param' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!PREFIX_RE.test(prefix)) {
    return c.json({ error: 'invalid_prefix' }, 400, { 'Cache-Control': 'no-store' });
  }

  try {
    const upstream = await fetch(`${HIBP_RANGE}/${prefix.toUpperCase()}`, {
      headers: {
        'user-agent': UA,
        'Add-Padding': 'true',
        accept: 'text/plain',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return c.json({ error: `upstream_${upstream.status}` }, 502, {
        'Cache-Control': 'no-store',
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return c.json({ error: 'upstream_error' }, 502, {
      'Cache-Control': 'no-store',
    });
  }
}

/**
 * Email breach lookup.
 *
 * Primary: XposedOrNot breach-analytics endpoint.
 * Fallback: LeakCheck public API (rate-limited per IP).
 */
export async function breachEmailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ error: 'missing_param' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'invalid_email' }, 400, { 'Cache-Control': 'no-store' });
  }

  // ── Try XposedOrNot first ──────────────────────────────────────────────────
  try {
    const upstream = await fetch(`${XON_BASE}/breach-analytics?email=${encodeURIComponent(email)}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (upstream.ok) {
      const data = (await upstream.json()) as XonBreachAnalyticsResponse;

      // XposedOrNot returns ExposedBreaches: null when no breaches found.
      // It may also return {Error: 'Not found'} for unknown emails.
      const details = data?.ExposedBreaches?.breaches_details;
      if (!details || details.length === 0) {
        const resp: BreachEmailResponse = {
          email,
          found: false,
          source: 'xposedornot',
          breach_count: 0,
          breaches: [],
        };
        return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
      }

      const breaches: BreachEntry[] = details.map((d) => ({
        name: d.breach,
        domain: d.domain || undefined,
        breach_date: d.xposed_date || undefined,
        description: d.details || undefined,
        pwn_count: typeof d.xposed_records === 'number' ? d.xposed_records : Number(d.xposed_records) || undefined,
        data_classes: d.xposed_data ? d.xposed_data.split(';').filter(Boolean) : undefined,
        logo: d.logo || undefined,
      }));

      const resp: BreachEmailResponse = {
        email,
        found: true,
        source: 'xposedornot',
        breach_count: breaches.length,
        breaches,
      };
      return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
    }

    // XposedOrNot returned a non-2xx status — fall through to LeakCheck
  } catch {
    // network/timeout error — fall through to LeakCheck
  }

  // ── Fallback: LeakCheck ───────────────────────────────────────────────────
  try {
    const upstream = await fetch(`${LEAKCHECK_BASE}?check=${encodeURIComponent(email)}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return c.json({ error: `upstream_${upstream.status}` }, 502, { 'Cache-Control': 'no-store' });
    }

    const data = (await upstream.json()) as LeakCheckResponse;
    // LeakCheck returns {success: false, error: "Not found"} for clean emails — treat as found=false
    if (!data.success) {
      if (data.error === 'Not found') {
        const resp: BreachEmailResponse = {
          email,
          found: false,
          source: 'leakcheck',
          breach_count: 0,
          breaches: [],
        };
        return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
      }
      return c.json({ error: 'upstream_error' }, 502, { 'Cache-Control': 'no-store' });
    }

    const sources = data.sources ?? [];
    const breaches: BreachEntry[] = sources.map((s) => ({
      name: s.name,
      breach_date: s.date || undefined,
      data_classes: data.fields ? [...data.fields] : undefined,
    }));

    const resp: BreachEmailResponse = {
      email,
      found: data.found > 0,
      source: 'leakcheck',
      breach_count: data.found,
      breaches,
    };
    return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch {
    return c.json({ error: 'upstream_error' }, 502, { 'Cache-Control': 'no-store' });
  }
}

/**
 * Domain breach lookup.
 *
 * Primary: XposedOrNot /v1/breaches?domain=<domain>
 * Fallback: LeakCheck public API.
 */
export async function breachDomainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) {
    return c.json({ error: 'missing_param' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid_domain' }, 400, { 'Cache-Control': 'no-store' });
  }

  // ── Try XposedOrNot first ──────────────────────────────────────────────────
  try {
    const upstream = await fetch(`${XON_BASE}/breaches?domain=${encodeURIComponent(domain)}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (upstream.ok) {
      const data = (await upstream.json()) as XonDomainResponse;
      // XposedOrNot filters by domain server-side, but do a client-side filter too as a safety net.
      const raw = data?.exposedBreaches ?? [];
      const filtered = raw.filter((b) => !b.domain || b.domain === domain);

      const breaches: BreachDomainEntry[] = (filtered.length > 0 ? filtered : raw).map((b) => ({
        name: b.breachID,
        domain: b.domain || undefined,
        breach_date: b.breachedDate ? b.breachedDate.slice(0, 10) : undefined,
        pwn_count: b.exposedRecords ?? undefined,
        description: b.exposureDescription || undefined,
        logo: b.logo || undefined,
      }));

      const resp: BreachDomainResponse = {
        domain,
        found: breaches.length > 0,
        source: 'xposedornot',
        breach_count: breaches.length,
        breaches,
      };
      return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
    }

    // XposedOrNot returned a non-2xx status — fall through to LeakCheck
  } catch {
    // network/timeout error — fall through to LeakCheck
  }

  // ── Fallback: LeakCheck ───────────────────────────────────────────────────
  try {
    const upstream = await fetch(`${LEAKCHECK_BASE}?check=${encodeURIComponent(domain)}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return c.json({ error: `upstream_${upstream.status}` }, 502, { 'Cache-Control': 'no-store' });
    }

    const data = (await upstream.json()) as LeakCheckResponse;
    // LeakCheck returns {success: false, error: "Not found"} for clean domains — treat as found=false
    if (!data.success) {
      if (data.error === 'Not found') {
        const resp: BreachDomainResponse = {
          domain,
          found: false,
          source: 'leakcheck',
          breach_count: 0,
          breaches: [],
        };
        return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
      }
      return c.json({ error: 'upstream_error' }, 502, { 'Cache-Control': 'no-store' });
    }

    const sources = data.sources ?? [];
    const breaches: BreachDomainEntry[] = sources.map((s) => ({
      name: s.name,
      breach_date: s.date || undefined,
    }));

    const resp: BreachDomainResponse = {
      domain,
      found: data.found > 0,
      source: 'leakcheck',
      breach_count: data.found,
      breaches,
    };
    return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch {
    return c.json({ error: 'upstream_error' }, 502, { 'Cache-Control': 'no-store' });
  }
}
