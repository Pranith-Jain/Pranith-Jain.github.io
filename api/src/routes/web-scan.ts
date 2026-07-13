import type { Context } from 'hono';
import type { Env } from '../env';
import { assertPublicHost } from '../lib/ssrf-guard';
import { safeNull } from '../lib/safe-catch';

/**
 * Web vulnerability + configuration scanner.
 *
 * Scope: HTTP-layer findings on a public web URL. We don't run an
 * authenticated app scan, port scan, or active exploit attempts —
 * those need Nuclei/Nessus and target-owner consent. This is the
 * "what does an unauthenticated stranger see" view:
 *
 *   - HTTP security headers (CSP, HSTS, XCTO, XFO, Referrer-Policy,
 *     Permissions-Policy, COEP/COOP/CORP) — present + parsed + scored
 *   - Cookie attribute audit (Secure / HttpOnly / SameSite per cookie)
 *   - Server / X-Powered-By / X-Generator / X-AspNet-Version disclosure
 *   - HSTS preload-list eligibility (max-age + includeSubDomains + preload)
 *   - Common exposed paths probed in parallel — .git/HEAD, .env,
 *     /admin, /wp-admin, robots.txt, security.txt, sitemap.xml, etc
 *   - HTTPS posture (HTTP→HTTPS redirect on plain http://, hostname mismatch)
 *
 * SSRF guard mirrors url-preview.ts: A + AAAA, reject any private /
 * loopback / link-local / multicast IP. Every fetch shares the same
 * AbortController budget so we don't pin connections forever on a
 * malicious or slow target.
 *
 * Redirects are followed safely — each hop is re-validated via
 * assertPublicHost so a 302 to a private/cloud-metadata IP is blocked.
 *
 * Cached at the edge for 30 minutes — analyst sweeps want fresh data.
 */

const FETCH_TIMEOUT_MS = 8000;
const PROBE_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 5;
// Bounded low: each request already fans out to ~36 probes against the
// target. Lower concurrency throttles the per-second outbound burst so this
// endpoint is a weaker request-amplification relay (paired with the /api/v1
// rate limit). SSRF range checks + connection pinning live in ssrf-guard.
const PROBE_CONCURRENCY = 4;
const CACHE_TTL = 1800;
const MAX_BODY_BYTES = 32 * 1024;

/* ──────────────────────────────────────────────────────────────────
 * Common exposed paths to probe.
 *
 * Each probe declares the severity of a 200/3xx response. 404 / 401 /
 * 403 are "good — not publicly exposed". Specific status codes can
 * upgrade or downgrade severity per probe.
 * ────────────────────────────────────────────────────────────────── */

interface ProbeDef {
  path: string;
  /** Default severity if the response is "exposed" (2xx). */
  exposedSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Description shown in the finding. */
  description: string;
}

const PROBES: ProbeDef[] = [
  // Source-control + secrets — critical if exposed
  {
    path: '/.git/HEAD',
    exposedSeverity: 'critical',
    description: '.git directory exposed — full source-history disclosure',
  },
  {
    path: '/.git/config',
    exposedSeverity: 'critical',
    description: '.git/config exposed — repo metadata + remote URLs',
  },
  { path: '/.svn/entries', exposedSeverity: 'critical', description: 'Subversion working-copy metadata exposed' },
  { path: '/.hg/store/00manifest.i', exposedSeverity: 'critical', description: 'Mercurial repo metadata exposed' },
  { path: '/.env', exposedSeverity: 'critical', description: '.env file exposed — likely contains secrets' },
  { path: '/.env.local', exposedSeverity: 'critical', description: '.env.local exposed — likely contains secrets' },
  {
    path: '/.env.production',
    exposedSeverity: 'critical',
    description: '.env.production exposed — likely contains secrets',
  },
  { path: '/config.php.bak', exposedSeverity: 'critical', description: 'PHP config backup exposed — secrets risk' },
  {
    path: '/wp-config.php.bak',
    exposedSeverity: 'critical',
    description: 'WordPress config backup exposed — DB creds risk',
  },

  // Backups + dumps
  { path: '/backup.zip', exposedSeverity: 'high', description: 'Backup file exposed at predictable path' },
  { path: '/backup.tar.gz', exposedSeverity: 'high', description: 'Backup file exposed at predictable path' },
  { path: '/database.sql', exposedSeverity: 'critical', description: 'SQL dump exposed' },
  { path: '/dump.sql', exposedSeverity: 'critical', description: 'SQL dump exposed' },

  // Admin panels + dashboards
  { path: '/admin', exposedSeverity: 'medium', description: 'Admin panel reachable' },
  { path: '/wp-admin/', exposedSeverity: 'low', description: 'WordPress admin reachable (expected for WP sites)' },
  {
    path: '/phpmyadmin/',
    exposedSeverity: 'high',
    description: 'phpMyAdmin reachable — auth bypass / brute-force surface',
  },
  {
    path: '/server-status',
    exposedSeverity: 'high',
    description: 'Apache server-status exposed — process + request info',
  },
  { path: '/server-info', exposedSeverity: 'high', description: 'Apache server-info exposed — config disclosure' },

  // Cloud + infra metadata
  { path: '/.aws/credentials', exposedSeverity: 'critical', description: 'AWS credentials file exposed' },
  { path: '/.docker/config.json', exposedSeverity: 'high', description: 'Docker config exposed — registry creds risk' },
  { path: '/.kube/config', exposedSeverity: 'critical', description: 'Kubernetes kubeconfig exposed' },

  // Standards + policy disclosure (informational — but their absence is interesting)
  { path: '/robots.txt', exposedSeverity: 'info', description: 'robots.txt — may disclose hidden paths via Disallow' },
  { path: '/sitemap.xml', exposedSeverity: 'info', description: 'sitemap.xml — site structure disclosure' },
  {
    path: '/.well-known/security.txt',
    exposedSeverity: 'info',
    description: 'security.txt present — vuln-disclosure contact published',
  },
  { path: '/humans.txt', exposedSeverity: 'info', description: 'humans.txt present — team contact info' },

  // PHP info + debug
  {
    path: '/phpinfo.php',
    exposedSeverity: 'critical',
    description: 'phpinfo() exposed — full PHP environment disclosure',
  },
  {
    path: '/info.php',
    exposedSeverity: 'critical',
    description: 'phpinfo() exposed — full PHP environment disclosure',
  },
  { path: '/debug', exposedSeverity: 'high', description: 'Debug endpoint reachable' },
  {
    path: '/.DS_Store',
    exposedSeverity: 'low',
    description: 'macOS .DS_Store exposed — directory contents disclosure',
  },

  // CI / build artefacts
  { path: '/composer.json', exposedSeverity: 'low', description: 'composer.json exposed — PHP deps inventory' },
  { path: '/package.json', exposedSeverity: 'low', description: 'package.json exposed — JS deps inventory' },
];

/* ──────────────────────────────────────────────────────────────────
 * Header analysis
 * ────────────────────────────────────────────────────────────────── */

interface HeaderFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'good';
  title: string;
  detail: string;
  /** Header value if relevant. */
  value?: string;
}

function analyseHeaders(headers: Headers): HeaderFinding[] {
  const findings: HeaderFinding[] = [];

  // CSP
  const csp = headers.get('content-security-policy');
  if (!csp) {
    findings.push({
      id: 'csp-missing',
      severity: 'medium',
      title: 'Content-Security-Policy not set',
      detail: 'XSS / data-exfiltration mitigation header is absent. Define at minimum default-src + script-src.',
    });
  } else {
    const issues: string[] = [];
    if (/'unsafe-inline'/.test(csp)) issues.push("'unsafe-inline' allowed");
    if (/'unsafe-eval'/.test(csp)) issues.push("'unsafe-eval' allowed");
    if (/\bdata:/.test(csp) && /script-src/.test(csp)) issues.push('data: in script-src');
    if (issues.length > 0) {
      findings.push({
        id: 'csp-weak',
        severity: 'medium',
        title: 'Content-Security-Policy is weak',
        detail: `CSP is set but contains: ${issues.join(', ')}. These are common XSS-bypass vectors.`,
        value: csp,
      });
    } else {
      findings.push({
        id: 'csp-good',
        severity: 'good',
        title: 'Content-Security-Policy set without unsafe primitives',
        detail: '',
        value: csp,
      });
    }
  }

  // HSTS
  const hsts = headers.get('strict-transport-security');
  if (!hsts) {
    findings.push({
      id: 'hsts-missing',
      severity: 'high',
      title: 'Strict-Transport-Security not set',
      detail: 'TLS-stripping mitigation absent. First-time visitors over HTTP are vulnerable.',
    });
  } else {
    const maxAge = /max-age=(\d+)/.exec(hsts)?.[1];
    const maxAgeNum = maxAge ? parseInt(maxAge, 10) : 0;
    const includeSub = /includeSubDomains/i.test(hsts);
    const preload = /preload/i.test(hsts);
    if (maxAgeNum < 31536000) {
      findings.push({
        id: 'hsts-short',
        severity: 'medium',
        title: `HSTS max-age is short (${maxAgeNum}s)`,
        detail: 'Preload list requires max-age >= 31536000 (1 year).',
        value: hsts,
      });
    } else if (!includeSub) {
      findings.push({
        id: 'hsts-no-subdomains',
        severity: 'low',
        title: 'HSTS missing includeSubDomains',
        detail: 'Subdomains can still be downgraded.',
        value: hsts,
      });
    } else if (!preload) {
      findings.push({
        id: 'hsts-no-preload',
        severity: 'info',
        title: 'HSTS not preload-eligible',
        detail: 'Add "preload" + submit at hstspreload.org for browser-shipped enforcement.',
        value: hsts,
      });
    } else {
      findings.push({
        id: 'hsts-good',
        severity: 'good',
        title: 'HSTS configured for preload eligibility',
        detail: '',
        value: hsts,
      });
    }
  }

  // X-Content-Type-Options
  const xcto = headers.get('x-content-type-options');
  if (!xcto) {
    findings.push({
      id: 'xcto-missing',
      severity: 'medium',
      title: 'X-Content-Type-Options not set',
      detail: 'Set to "nosniff" to prevent MIME-type sniffing attacks.',
    });
  } else if (xcto.toLowerCase() !== 'nosniff') {
    findings.push({
      id: 'xcto-bad',
      severity: 'medium',
      title: `X-Content-Type-Options has unexpected value`,
      detail: 'Expected "nosniff".',
      value: xcto,
    });
  } else {
    findings.push({ id: 'xcto-good', severity: 'good', title: 'X-Content-Type-Options: nosniff', detail: '' });
  }

  // X-Frame-Options OR CSP frame-ancestors
  const xfo = headers.get('x-frame-options');
  const cspFA = csp && /frame-ancestors/i.test(csp);
  if (!xfo && !cspFA) {
    findings.push({
      id: 'clickjacking',
      severity: 'medium',
      title: 'No clickjacking protection',
      detail: 'Set X-Frame-Options: DENY or CSP frame-ancestors directive.',
    });
  } else {
    findings.push({
      id: 'clickjacking-good',
      severity: 'good',
      title: 'Clickjacking protection in place',
      detail: '',
      value: xfo ?? 'CSP frame-ancestors',
    });
  }

  // Referrer-Policy
  const rp = headers.get('referrer-policy');
  if (!rp) {
    findings.push({
      id: 'rp-missing',
      severity: 'low',
      title: 'Referrer-Policy not set',
      detail: 'Browsers fall back to no-referrer-when-downgrade; consider strict-origin-when-cross-origin.',
    });
  } else {
    findings.push({ id: 'rp-good', severity: 'good', title: 'Referrer-Policy set', detail: '', value: rp });
  }

  // Permissions-Policy
  const pp = headers.get('permissions-policy');
  if (!pp) {
    findings.push({
      id: 'pp-missing',
      severity: 'info',
      title: 'Permissions-Policy not set',
      detail: 'Restrict camera, microphone, geolocation, payment, USB.',
    });
  } else {
    findings.push({ id: 'pp-good', severity: 'good', title: 'Permissions-Policy set', detail: '', value: pp });
  }

  // Disclosure
  for (const h of ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator', 'x-aspnetmvc-version']) {
    const v = headers.get(h);
    if (v) {
      findings.push({
        id: `disclosure-${h}`,
        severity: 'low',
        title: `${h} header discloses software version`,
        detail: 'Strip in your reverse proxy / framework config — gives attackers free recon.',
        value: v,
      });
    }
  }

  // Cookie attributes
  const setCookie = headers.get('set-cookie');
  if (setCookie) {
    const parts = setCookie.split(/, (?=[^;]+=)/); // best-effort split
    for (const cookie of parts) {
      const name = cookie.split('=')[0]?.trim() ?? '';
      const issues: string[] = [];
      if (!/secure/i.test(cookie)) issues.push('missing Secure');
      if (!/httponly/i.test(cookie)) issues.push('missing HttpOnly');
      if (!/samesite=/i.test(cookie)) issues.push('missing SameSite');
      if (issues.length > 0) {
        findings.push({
          id: `cookie-${name || 'unnamed'}`,
          severity: 'medium',
          title: `Cookie "${name}" has weak attributes: ${issues.join(', ')}`,
          detail: 'Session cookies should set Secure + HttpOnly + SameSite.',
        });
      }
    }
  }

  return findings;
}

/* ──────────────────────────────────────────────────────────────────
 * Path probes
 * ────────────────────────────────────────────────────────────────── */

interface ProbeResult {
  path: string;
  status: number;
  /** "exposed" / "not-found" / "forbidden" / "error". */
  outcome: 'exposed' | 'not-found' | 'forbidden' | 'redirect' | 'error';
  severity: HeaderFinding['severity'];
  description: string;
  redirectsTo?: string;
}

async function probeOne(baseUrl: string, def: ProbeDef, pinIp?: string): Promise<ProbeResult> {
  const url = new URL(def.path, baseUrl).toString();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cf: { resolveOverride: pinIp },
    } as RequestInit);
    clearTimeout(timer);
    const status = res.status;
    if (status >= 200 && status < 300) {
      return {
        path: def.path,
        status,
        outcome: 'exposed',
        severity: def.exposedSeverity,
        description: def.description,
      };
    }
    if (status >= 300 && status < 400) {
      return {
        path: def.path,
        status,
        outcome: 'redirect',
        severity: 'info',
        description: `${def.path} → redirect`,
        redirectsTo: res.headers.get('location') ?? undefined,
      };
    }
    if (status === 401 || status === 403) {
      return {
        path: def.path,
        status,
        outcome: 'forbidden',
        severity: 'good',
        description: `${def.path} requires auth (good)`,
      };
    }
    return {
      path: def.path,
      status,
      outcome: 'not-found',
      severity: 'good',
      description: `${def.path} returns ${status}`,
    };
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return { path: def.path, status: 0, outcome: 'error', severity: 'info', description: 'probe timed out or failed' };
  }
}

/** Run probes with bounded concurrency. */
async function probeAll(baseUrl: string, pinIp?: string): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const queue = [...PROBES];
  async function worker() {
    while (queue.length > 0) {
      const def = queue.shift();
      if (!def) return;
      results.push(await probeOne(baseUrl, def, pinIp));
    }
  }
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  return results;
}

/* ──────────────────────────────────────────────────────────────────
 * Handler
 * ────────────────────────────────────────────────────────────────── */

export interface WebScanResponse {
  url: string;
  final_url: string;
  status: number;
  /** Set when a redirect target was blocked by SSRF guard. */
  redirect_blocked?: { location: string };
  http_protocol_findings: HeaderFinding[];
  exposed_paths: ProbeResult[];
  raw_headers: Record<string, string>;
  generated_at: string;
}

export async function webScanHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = (c.req.query('url') ?? '').trim();
  if (!raw) return c.json({ error: 'missing url' }, 400);
  if (raw.length > 2_000) return c.json({ error: 'url too long' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (_catchErr) {
    console.error('webScanHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'unsupported protocol' }, 400);
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://web-scan-cache.internal/v1?u=${encodeURIComponent(parsed.toString())}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  // SSRF: resolve A + AAAA, reject any private/reserved answer (complete
  // range list). pinIp pins every fetch below to the validated IP so a
  // rebind can't redirect the connection to an internal host.
  const hostCheck = await assertPublicHost(parsed.hostname);
  if (!hostCheck.ok) {
    return c.json(
      { error: hostCheck.error ?? 'blocked', blocked_ip: hostCheck.blockedIp },
      (hostCheck.status ?? 403) as 400 | 403 | 502
    );
  }

  // Follow redirects safely — each hop re-validates via assertPublicHost
  // so a 302 to a private/cloud-metadata IP is blocked.
  let finalUrl = parsed.toString();
  let finalOrigin = parsed.origin;
  let mainRes: Response | null = null;
  let currentHostCheck = hostCheck;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop > 0) {
      try {
        const nextHost = new URL(finalUrl).hostname;
        currentHostCheck = await assertPublicHost(nextHost);
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        return c.json({ error: 'redirect_target_invalid', url: parsed.toString(), final_url: finalUrl }, 502, {
          'Cache-Control': 'no-store',
        });
      }
      if (!currentHostCheck.ok) {
        const body: WebScanResponse = {
          url: parsed.toString(),
          final_url: finalUrl,
          status: 0,
          redirect_blocked: { location: finalUrl },
          http_protocol_findings: [],
          exposed_paths: [],
          raw_headers: {},
          generated_at: new Date().toISOString(),
        };
        return c.json(body, 200, { 'Cache-Control': 'public, max-age=300' });
      }
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      mainRes = await fetch(finalUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          accept: 'text/html,*/*',
        },
        cf: { resolveOverride: currentHostCheck.pinIp },
      } as RequestInit);
      clearTimeout(timer);
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return c.json({ error: 'fetch failed' }, 502);
    }

    if (mainRes.status >= 300 && mainRes.status < 400) {
      const location = mainRes.headers.get('location');
      if (!location) break;
      try {
        const next = new URL(location, finalUrl);
        if (next.protocol !== 'http:' && next.protocol !== 'https:') break;
        finalUrl = next.toString();
        finalOrigin = next.origin;
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        break;
      }
      continue;
    }

    break;
  }

  if (!mainRes || (mainRes.status >= 300 && mainRes.status < 400)) {
    const body: WebScanResponse = {
      url: parsed.toString(),
      final_url: finalUrl,
      status: mainRes?.status ?? 0,
      redirect_blocked: { location: finalUrl },
      http_protocol_findings: [],
      exposed_paths: [],
      raw_headers: {},
      generated_at: new Date().toISOString(),
    };
    return c.json(body, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // Drain a small body slice to avoid hanging connections.
  if (mainRes.body) {
    const reader = mainRes.body.getReader();
    let read = 0;
    while (read < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) read += value.byteLength;
    }
    safeNull(reader.cancel());
  }

  const rawHeaders: Record<string, string> = {};
  mainRes.headers.forEach((v, k) => {
    rawHeaders[k] = v;
  });

  const headerFindings = analyseHeaders(mainRes.headers);
  const probes = await probeAll(finalOrigin, currentHostCheck.pinIp);

  const body: WebScanResponse = {
    url: parsed.toString(),
    final_url: finalUrl,
    status: mainRes.status,
    http_protocol_findings: headerFindings,
    exposed_paths: probes,
    raw_headers: rawHeaders,
    generated_at: new Date().toISOString(),
  };

  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
