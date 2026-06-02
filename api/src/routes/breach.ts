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

type BreachSource =
  | 'xposedornot'
  | 'leakcheck'
  | 'leakix'
  | 'proxynova'
  | 'hudsonrock'
  | 'projectdiscovery'
  | 'hackmyip';

interface BreachEntry {
  name: string;
  domain?: string;
  breach_date?: string;
  description?: string;
  pwn_count?: number;
  data_classes?: string[];
  logo?: string;
  source: BreachSource;
}

interface BreachEmailResponse {
  email: string;
  found: boolean;
  /** First source that contributed a real breach entry, or empty string. */
  source: string;
  sources_queried: string[];
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
  source: BreachSource;
}

interface BreachDomainResponse {
  domain: string;
  found: boolean;
  /** First source that contributed a real breach entry, or empty string. */
  source: string;
  sources_queried: string[];
  breach_count: number;
  breaches: BreachDomainEntry[];
}

// ─── XposedOrNot response shapes ────────────────────────────────────────────

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
  xposed_data: string;
  xposed_date: string;
  xposed_records: number;
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

// ─── internal query helpers ──────────────────────────────────────────────────

async function queryXonEmail(email: string): Promise<BreachEntry[]> {
  const upstream = await fetch(`${XON_BASE}/breach-analytics?email=${encodeURIComponent(email)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return [];
  const data = (await upstream.json()) as XonBreachAnalyticsResponse;
  const details = data?.ExposedBreaches?.breaches_details;
  if (!details || details.length === 0) return [];
  return details.map((d) => ({
    name: d.breach,
    domain: d.domain || undefined,
    breach_date: d.xposed_date || undefined,
    description: d.details || undefined,
    pwn_count: typeof d.xposed_records === 'number' ? d.xposed_records : Number(d.xposed_records) || undefined,
    data_classes: d.xposed_data ? d.xposed_data.split(';').filter(Boolean) : undefined,
    logo: d.logo || undefined,
    source: 'xposedornot' as const,
  }));
}

async function queryLcEmail(email: string): Promise<BreachEntry[]> {
  const upstream = await fetch(`${LEAKCHECK_BASE}?check=${encodeURIComponent(email)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return [];
  const data = (await upstream.json()) as LeakCheckResponse;
  if (!data.success || data.error === 'Not found' || !data.sources) return [];
  return data.sources.map((s) => ({
    name: s.name,
    breach_date: s.date || undefined,
    data_classes: data.fields ? [...data.fields] : undefined,
    source: 'leakcheck' as const,
  }));
}

// ─── additional source query helpers ────────────────────────────────────────

async function queryLeakIx(q: string): Promise<BreachEntry[]> {
  try {
    const res = await fetch(`https://leakix.net/search?q=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      ip?: string;
      port?: number;
      leak?: { id: string; leak_type: string; leak_data: string; created_at: string };
    }>;
    return data.slice(0, 20).map((r) => ({
      name: r.leak?.leak_type || 'leakix_result',
      domain: r.ip,
      breach_date: r.leak?.created_at?.slice(0, 10),
      description: `${r.ip}:${r.port} — ${r.leak?.leak_data || 'no details'}`,
      source: 'leakix' as const,
    }));
  } catch {
    return [];
  }
}

async function queryProxyNova(q: string): Promise<BreachEntry[]> {
  try {
    const res = await fetch(`https://api.proxynova.com/comb?query=${encodeURIComponent(q)}&limit=50`, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { count: number; lines: string[] };
    return data.count > 0
      ? [
          {
            name: 'ProxyNova COMB',
            description: `${data.count} combolist entries found`,
            pwn_count: data.count,
            source: 'proxynova' as const,
          },
        ]
      : [];
  } catch {
    return [];
  }
}

async function queryHudsonRockEmail(email: string): Promise<BreachEntry[]> {
  try {
    const res = await fetch(
      `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email=${encodeURIComponent(email)}`,
      {
        headers: { accept: 'application/json', 'user-agent': UA },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data: Array<{
        stealer_family: string;
        date_compromised: string;
        date_uploaded: string;
        credentials: Array<{ domain: string; url: string }>;
      }>;
    };
    if (!data.data?.length) return [];
    const totalCreds = data.data.reduce((s, e) => s + e.credentials.length, 0);
    return data.data.slice(0, 10).map((e) => ({
      name: `HudsonRock: ${e.stealer_family}`,
      breach_date: e.date_compromised?.slice(0, 10),
      description: `${e.credentials.length} credentials from ${e.stealer_family} stealer`,
      domain: e.credentials[0]?.domain,
      pwn_count: totalCreds,
      source: 'hudsonrock' as const,
    }));
  } catch {
    return [];
  }
}

async function queryProjectDiscovery(email: string): Promise<BreachEntry[]> {
  // ProjectDiscovery's email-leak stats endpoint doesn't return a per-breach
  // payload — it just confirms the service is reachable. We surface the
  // reachability in `sources_queried` (the handler decides that) but do NOT
  // synthesize a "breach" entry. Otherwise the aggregate `found: true` would
  // fire for every email that hits a 200 — even when no actual breach was
  // reported — which made the email/domain lookups unusable for triage.
  try {
    const res = await fetch(`https://api.projectdiscovery.io/v1/leaks/stats/email?email=${encodeURIComponent(email)}`, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return [];
  } catch {
    return [];
  }
}

async function queryHackMyIp(email: string): Promise<BreachEntry[]> {
  // Same as ProjectDiscovery above — the endpoint confirms reachability but
  // doesn't return a per-record payload. Synthetic entries used to inflate
  // the breach count for every reachable email; returning [] here keeps the
  // `found` flag honest.
  try {
    const res = await fetch(`https://hackmyip.com/api/breach?email=${encodeURIComponent(email)}`, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return [];
  } catch {
    return [];
  }
}

async function queryXonDomain(domain: string): Promise<BreachDomainEntry[]> {
  const upstream = await fetch(`${XON_BASE}/breaches?domain=${encodeURIComponent(domain)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return [];
  const data = (await upstream.json()) as XonDomainResponse;
  const raw = data?.exposedBreaches ?? [];
  const filtered = raw.filter((b) => !b.domain || b.domain === domain);
  return (filtered.length > 0 ? filtered : raw).map((b) => ({
    name: b.breachID,
    domain: b.domain || undefined,
    breach_date: b.breachedDate ? b.breachedDate.slice(0, 10) : undefined,
    pwn_count: b.exposedRecords ?? undefined,
    description: b.exposureDescription || undefined,
    logo: b.logo || undefined,
    source: 'xposedornot' as const,
  }));
}

async function queryLcDomain(domain: string): Promise<BreachDomainEntry[]> {
  const upstream = await fetch(`${LEAKCHECK_BASE}?check=${encodeURIComponent(domain)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return [];
  const data = (await upstream.json()) as LeakCheckResponse;
  if (!data.success || data.error === 'Not found' || !data.sources) return [];
  return data.sources.map((s) => ({
    name: s.name,
    breach_date: s.date || undefined,
    source: 'leakcheck' as const,
  }));
}

// ─── handlers ─────────────────────────────────────────────────────────────────

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
 * Queries XposedOrNot and LeakCheck in parallel and combines results
 * with per-breach source attribution.
 */
export async function breachEmailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ error: 'missing_param' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'invalid_email' }, 400, { 'Cache-Control': 'no-store' });
  }

  const sources = await Promise.allSettled([
    queryXonEmail(email),
    queryLcEmail(email),
    queryLeakIx(email),
    queryProxyNova(email),
    queryHudsonRockEmail(email),
    queryProjectDiscovery(email),
    queryHackMyIp(email),
  ]);
  const sourceNames: BreachSource[] = [
    'xposedornot',
    'leakcheck',
    'leakix',
    'proxynova',
    'hudsonrock',
    'projectdiscovery',
    'hackmyip',
  ];

  // Primary upstreams (XposedOrNot, LeakCheck) carry the actual breach
  // payloads; the rest are metadata-only / fallback. If BOTH primaries
  // rejected, treat it as an upstream outage and 502 — otherwise clients
  // would see a confusing "found: false" with no indication that the
  // breach DBs were unreachable.
  const primaryRejected = sources[0]?.status === 'rejected' && sources[1]?.status === 'rejected';
  if (primaryRejected) {
    return c.json({ error: 'upstream_error', message: 'breach upstreams unavailable' }, 502, {
      'Cache-Control': 'no-store',
    });
  }

  const breaches: BreachEntry[] = [];
  const sourcesQueried: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const name = sourceNames[i];
    if (s && s.status === 'fulfilled') {
      const val = (s as PromiseFulfilledResult<BreachEntry[]>).value;
      if (val.length > 0) breaches.push(...val);
      if (name) sourcesQueried.push(name);
    }
  }

  const resp: BreachEmailResponse = {
    email,
    found: breaches.length > 0,
    source: breaches[0]?.source ?? sourceNames[0] ?? '',
    sources_queried: sourcesQueried,
    breach_count: breaches.length,
    breaches,
  };
  return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
}

/**
 * Domain breach lookup.
 *
 * Queries XposedOrNot and LeakCheck in parallel and combines results
 * with per-breach source attribution.
 */
export async function breachDomainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) {
    return c.json({ error: 'missing_param' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid_domain' }, 400, { 'Cache-Control': 'no-store' });
  }

  const sources = await Promise.allSettled([
    queryXonDomain(domain),
    queryLcDomain(domain),
    queryLeakIx(domain),
    queryHudsonRockEmail(domain),
  ]);
  const sourceNames: BreachSource[] = ['xposedornot', 'leakcheck', 'leakix', 'hudsonrock'];

  // See breachEmailHandler — 502 when both primary upstreams reject.
  const primaryRejected = sources[0]?.status === 'rejected' && sources[1]?.status === 'rejected';
  if (primaryRejected) {
    return c.json({ error: 'upstream_error', message: 'breach upstreams unavailable' }, 502, {
      'Cache-Control': 'no-store',
    });
  }

  const breaches: BreachDomainEntry[] = [];
  const sourcesQueried: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const name = sourceNames[i];
    if (s && s.status === 'fulfilled') {
      const val = (s as PromiseFulfilledResult<BreachDomainEntry[]>).value;
      if (val.length > 0) breaches.push(...val);
      if (name) sourcesQueried.push(name);
    }
  }

  const resp: BreachDomainResponse = {
    domain,
    found: breaches.length > 0,
    source: breaches[0]?.source ?? sourceNames[0] ?? '',
    sources_queried: sourcesQueried,
    breach_count: breaches.length,
    breaches,
  };
  return c.json(resp, 200, { 'Cache-Control': 'public, max-age=3600' });
}
