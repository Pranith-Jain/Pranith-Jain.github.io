import { resolveRecord } from './dns';

/**
 * Shared egress guard for handlers that fetch a user-supplied URL
 * (url-preview, web-scan, …).
 *
 * Two problems it solves:
 *
 *  1. Incomplete reserved-range lists. The old per-handler regexes missed
 *     100.64.0.0/10 (CGNAT — used by Tailscale and several cloud LB
 *     fabrics), the TEST-NET / benchmarking ranges, and 6to4 relay
 *     anycast. Those are reachable internal-ish targets.
 *
 *  2. DNS rebinding / TOCTOU. Checking resolved IPs then calling
 *     `fetch(hostname)` lets `fetch` re-resolve independently — an
 *     attacker flips the record (TTL 0) between check and fetch and the
 *     Worker connects to an internal IP. `pinnedFetch` validates, then
 *     forces the connection to the validated IP via Cloudflare's
 *     `cf.resolveOverride` while leaving Host/SNI = the real hostname
 *     (so TLS still validates). No second, attacker-controlled lookup.
 */

// IPv4 private / loopback / link-local / CGNAT / TEST-NET / multicast /
// reserved. 224.0.0.0+ (224–255) is the trailing 22[4-9]|23\d|24\d|25[0-5].
//
// Cloud-metadata IPs:
//   - 169.254.169.254 — AWS, GCP, IBM, DigitalOcean, Oracle (caught by 169.254/16).
//   - 168.63.129.16 — Azure WireServer / DNS endpoint. Lives in public space,
//     so it has to be listed explicitly. Required for defence-in-depth on any
//     substrate where the worker might be reachable from Azure-allocated egress.
export const PRIVATE_IPV4 =
  /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|168\.63\.129\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.0\.|192\.0\.2\.|192\.88\.99\.|192\.168\.|198\.1[89]\.|198\.51\.100\.|203\.0\.113\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/;

export function isPrivateIpv6(addr: string): boolean {
  const a = addr.toLowerCase().trim();
  if (a === '::1' || a === '::') return true;
  // IPv4-mapped / -compatible (::ffff:a.b.c.d, ::a.b.c.d) — reapply v4 rules.
  const v4embedded = /(?:^::ffff:|^::)((?:\d{1,3}\.){3}\d{1,3})$/i.exec(a);
  if (v4embedded && v4embedded[1] && PRIVATE_IPV4.test(v4embedded[1])) return true;
  // Normalise leading zeros per group so prefix tests are reliable whether
  // the resolver returned compressed or fully-expanded form.
  const groups = a.split(':').map((p) => p.replace(/^0+/, '') || '0');
  const head = groups[0] ?? '';
  // fe80::/10 link-local + fec0::/10 (deprecated site-local, RFC 3879) —
  // covering both so a stale fec0:: address isn't reachable as an internal
  // pivot target even though IANA discourages its allocation.
  if (/^fe[89a-f]/.test(head)) return true;
  if (/^f[cd]/.test(head)) return true; // fc00::/7 unique-local
  if (head.startsWith('ff')) return true; // ff00::/8 multicast
  if (head === '2001' && groups[1] === 'db8') return true; // 2001:db8::/32 doc
  if (head === '2002') return true; // 2002::/16 6to4
  if (head === '64' && groups[1] === 'ff9b') return true; // 64:ff9b::/96 NAT64
  return false;
}

export interface HostCheck {
  ok: boolean;
  /** First validated public IP (used for connection pinning). */
  pinIp?: string;
  /** All resolved IPs. */
  ips: string[];
  /** HTTP status + error body to return when ok === false. */
  status?: number;
  error?: string;
  blockedIp?: string;
}

/** Strict dotted-quad and bare/bracketed-hex literal detectors. */
const IPV4_LITERAL = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_LITERAL = /^\[?[0-9a-fA-F:]+\]?$/;

/** Classify an IP literal in URL-hostname form, or `null` for real hostnames. */
function asIpLiteral(hostname: string): { kind: 'v4' | 'v6'; ip: string } | null {
  // WHATWG URL keeps the brackets around an IPv6 host: `new URL('http://[::1]/').hostname === '[::1]'`.
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (IPV4_LITERAL.test(bare)) return { kind: 'v4', ip: bare };
  if (bare.includes(':') && IPV6_LITERAL.test(bare)) return { kind: 'v6', ip: bare };
  return null;
}

/**
 * Resolve A + AAAA and refuse if ANY answer is private/reserved. Refusing on
 * any (not just the first) answer stops a multi-record response that mixes a
 * public and an internal IP.
 *
 * If the hostname is *already* an IP literal (e.g. `http://168.63.129.16/`),
 * we don't need DoH — validate it directly. Previously the DoH path returned
 * "no records" on a literal and routed the request into the 400 "host does
 * not resolve" branch. Result was still safe (refused) but the SSRF-block
 * intent was masked, and a future DoH-provider change could fall through.
 */
export async function assertPublicHost(hostname: string): Promise<HostCheck> {
  const literal = asIpLiteral(hostname);
  if (literal) {
    const blocked = literal.kind === 'v4' ? PRIVATE_IPV4.test(literal.ip) : isPrivateIpv6(literal.ip);
    if (blocked) {
      return {
        ok: false,
        ips: [literal.ip],
        status: 403,
        error: `host is a private/reserved IP literal — refusing to fetch`,
        blockedIp: literal.ip,
      };
    }
    // resolveOverride accepts a literal IP (v4 or v6); pin to it.
    return { ok: true, ips: [literal.ip], pinIp: literal.ip };
  }

  const [a, aaaa] = await Promise.all([resolveRecord(hostname, 'A'), resolveRecord(hostname, 'AAAA')]);
  if (a.error && aaaa.error) {
    return { ok: false, ips: [], status: 502, error: `dns lookup failed: ${a.error}` };
  }
  const v4 = a.records.filter((r) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(r));
  const v6 = aaaa.records.filter((r) => r.includes(':'));
  const all = [...v4, ...v6];
  if (all.length === 0) {
    return { ok: false, ips: [], status: 400, error: 'host does not resolve' };
  }
  const blocked = v4.find((ip) => PRIVATE_IPV4.test(ip)) ?? v6.find((ip) => isPrivateIpv6(ip));
  if (blocked) {
    return {
      ok: false,
      ips: all,
      status: 403,
      error: 'host resolves to a private/reserved IP — refusing to fetch',
      blockedIp: blocked,
    };
  }
  // Prefer an IPv4 pin (resolveOverride is most reliable with v4).
  return { ok: true, ips: all, pinIp: v4[0] ?? v6[0] };
}

/**
 * Validate `rawUrl`, then fetch with the connection pinned to the validated
 * IP. Throws `SsrfError` (carrying an HTTP status) on a blocked/invalid host
 * so callers can map it to a response.
 */
export class SsrfError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public blockedIp?: string
  ) {
    super(detail);
    this.name = 'SsrfError';
  }
}

export async function pinnedFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  // `pinnedFetch` validates + pins ONLY the first hostname. Letting the
  // runtime follow a 3xx would re-resolve the redirect target with no pin and
  // no public-IP re-validation — an SSRF bypass. Refuse the unsafe combination
  // outright; callers that must follow redirects use `pinnedFetchFollow`.
  if (init?.redirect === 'follow') {
    throw new SsrfError(500, 'pinnedFetch cannot follow redirects safely — use pinnedFetchFollow');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(400, 'invalid url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(400, 'unsupported protocol');
  }
  const check = await assertPublicHost(parsed.hostname);
  if (!check.ok) throw new SsrfError(check.status ?? 403, check.error ?? 'blocked', check.blockedIp);

  // Pin the connection to the validated IP (Host/SNI stay = hostname so TLS
  // still validates). Defeats rebinding: no attacker-controlled re-resolve.
  const cf = { resolveOverride: check.pinIp } as Record<string, unknown>;
  return fetch(parsed.toString(), { ...init, cf } as RequestInit);
}

/**
 * SSRF-safe fetch that ALSO follows redirects safely.
 *
 * `pinnedFetch` only validates + pins the FIRST hostname. Passing it
 * `redirect: 'follow'` is unsafe: the runtime follows a 3xx by re-resolving
 * the redirect target's hostname normally — with no `resolveOverride` pin and
 * no public-IP re-validation — so a public URL that 302s to
 * `http://169.254.169.254/…`, a private IP, or an internal hostname is
 * fetched anyway. That defeats the guard.
 *
 * This follows redirects MANUALLY: each hop is re-validated via
 * `assertPublicHost` and pinned via `resolveOverride` before the request is
 * made, exactly like url-preview/web-scan. Relative `Location` values are
 * resolved against the current URL; the hop count is capped. The single
 * `init.signal` (if any) bounds the whole chain.
 */
export async function pinnedFetchFollow(
  rawUrl: string,
  init?: RequestInit,
  opts: { maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new SsrfError(400, 'invalid url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new SsrfError(400, 'unsupported protocol');
    }
    const check = await assertPublicHost(parsed.hostname);
    if (!check.ok) throw new SsrfError(check.status ?? 403, check.error ?? 'blocked', check.blockedIp);

    const res = await fetch(parsed.toString(), {
      ...init,
      redirect: 'manual', // we follow manually so each hop is re-validated
      cf: { resolveOverride: check.pinIp },
    } as RequestInit);

    // Non-redirect (or a 3xx with no Location) → this is the final response.
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) return res;

    // Free the redirect response's connection before the next hop.
    try {
      await res.body?.cancel();
    } catch {
      /* best-effort */
    }
    try {
      currentUrl = new URL(location, parsed).toString(); // resolves relative redirects
    } catch {
      throw new SsrfError(400, 'invalid redirect location');
    }
  }
  throw new SsrfError(508, 'too many redirects');
}
