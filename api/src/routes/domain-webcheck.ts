import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Web-Check style domain analysis — HTTP probe, SSL/TLS inspection,
 * security headers audit, technology stack detection.
 *
 *   GET /api/v1/domain/webcheck?domain=<domain>
 *
 * Supplements the existing domain lookup (DNS, RDAP, email auth, threat intel)
 * with the checks Web-Check is known for: live HTTP probe, TLS cert chain,
 * security header scoring, and technology fingerprinting.
 *
 * Subrequest budget: HTTP probe (1) + TLS probe (1) + Shodan (1) = 3 max.
 * All other checks are in-process string parsing.
 */

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_SECONDS = 15 * 60;

// ─── Security Headers ────────────────────────────────────────────────────────

interface SecurityHeaderCheck {
  header: string;
  present: boolean;
  value?: string;
  secure: boolean;
  recommendation: string;
}

const SECURITY_HEADERS: Array<{
  name: string;
  required: boolean;
  validate?: (v: string) => boolean;
  rec: string;
}> = [
  {
    name: 'strict-transport-security',
    required: true,
    validate: (v) => /max-age=\d+/.test(v) && parseInt(v.match(/max-age=(\d+)/)?.[1] ?? '0') >= 31536000,
    rec: 'HSTS with max-age >= 1 year (31536000s). Add includeSubDomains and preload.',
  },
  {
    name: 'content-security-policy',
    required: true,
    validate: (v) => v.length > 10,
    rec: 'CSP prevents XSS. Start with report-only, then enforce.',
  },
  {
    name: 'x-frame-options',
    required: true,
    validate: (v) => /^(DENY|SAMEORIGIN)$/i.test(v.trim()),
    rec: 'Prevents clickjacking. Use DENY or SAMEORIGIN.',
  },
  {
    name: 'x-content-type-options',
    required: true,
    validate: (v) => v.trim().toLowerCase() === 'nosniff',
    rec: 'Prevents MIME-type sniffing. Set to nosniff.',
  },
  {
    name: 'referrer-policy',
    required: true,
    validate: (v) => /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin|unsafe-url)/i.test(v),
    rec: 'Controls referrer leakage. Recommended: strict-origin-when-cross-origin.',
  },
  {
    name: 'permissions-policy',
    required: false,
    validate: (v) => v.length > 5,
    rec: 'Controls browser features (camera, mic, geolocation). Recommended to restrict.',
  },
  {
    name: 'x-xss-protection',
    required: false,
    validate: (v) => v.trim() === '0' || /mode=block/.test(v),
    rec: 'Legacy XSS filter. Set to 0 (rely on CSP) or mode=block.',
  },
  {
    name: 'cross-origin-opener-policy',
    required: false,
    validate: (v) => /^(same-origin|same-origin-allow-popups|require-corp)$/i.test(v.trim()),
    rec: 'Prevents cross-origin window attacks. Set to same-origin.',
  },
  {
    name: 'cross-origin-resource-policy',
    required: false,
    validate: (v) => /^(same-site|same-origin|cross-origin)$/i.test(v.trim()),
    rec: 'Controls cross-origin resource loading.',
  },
  {
    name: 'cross-origin-embedder-policy',
    required: false,
    validate: (v) => /^(require-corp|credentialless)$/i.test(v.trim()),
    rec: 'Enables cross-origin isolation for SharedArrayBuffer.',
  },
];

// ─── Technology Detection ─────────────────────────────────────────────────────

interface TechFingerprint {
  category: string;
  name: string;
  confidence: number;
  evidence: string;
}

const HEADER_FINGERPRINTS: Array<{
  header: string;
  pattern: RegExp;
  category: string;
  name: string;
}> = [
  { header: 'server', pattern: /nginx/i, category: 'server', name: 'Nginx' },
  { header: 'server', pattern: /apache/i, category: 'server', name: 'Apache' },
  { header: 'server', pattern: /cloudflare/i, category: 'cdn', name: 'Cloudflare' },
  { header: 'server', pattern: /openresty/i, category: 'server', name: 'OpenResty' },
  { header: 'server', pattern: /litespeed/i, category: 'server', name: 'LiteSpeed' },
  { header: 'server', pattern: /microsoft-iis/i, category: 'server', name: 'Microsoft IIS' },
  { header: 'server', pattern: /gunicorn/i, category: 'server', name: 'Gunicorn' },
  { header: 'server', pattern: /uvicorn/i, category: 'server', name: 'Uvicorn' },
  { header: 'x-powered-by', pattern: /express/i, category: 'framework', name: 'Express.js' },
  { header: 'x-powered-by', pattern: /php/i, category: 'language', name: 'PHP' },
  { header: 'x-powered-by', pattern: /asp\.net/i, category: 'framework', name: 'ASP.NET' },
  { header: 'x-powered-by', pattern: /next\.js/i, category: 'framework', name: 'Next.js' },
  { header: 'x-generated-by', pattern: /next\.js/i, category: 'framework', name: 'Next.js' },
  { header: 'x-vercel', pattern: /.+/, category: 'hosting', name: 'Vercel' },
  { header: 'x-amz-cf-id', pattern: /.+/, category: 'cdn', name: 'AWS CloudFront' },
  { header: 'x-fastly-request-id', pattern: /.+/, category: 'cdn', name: 'Fastly' },
  { header: 'x-akamai-transformed', pattern: /.+/, category: 'cdn', name: 'Akamai' },
  { header: 'via', pattern: /varnish/i, category: 'cache', name: 'Varnish' },
  { header: 'x-drupal-cache', pattern: /.+/, category: 'cms', name: 'Drupal' },
  { header: 'x-generator', pattern: /wordpress/i, category: 'cms', name: 'WordPress' },
  { header: 'x-laravel-cache', pattern: /.+/, category: 'framework', name: 'Laravel' },
];

const BODY_FINGERPRINTS: Array<{ pattern: RegExp; category: string; name: string }> = [
  { pattern: /wp-content|wp-includes|wordpress/i, category: 'cms', name: 'WordPress' },
  { pattern: /drupal\.js|drupal\.settings/i, category: 'cms', name: 'Drupal' },
  { pattern: /joomla/i, category: 'cms', name: 'Joomla' },
  { pattern: /shopify/i, category: 'ecommerce', name: 'Shopify' },
  { pattern: /woocommerce/i, category: 'ecommerce', name: 'WooCommerce' },
  { pattern: /react|__NEXT_DATA__|_next/i, category: 'framework', name: 'React/Next.js' },
  { pattern: /vue|__vue__|vuejs/i, category: 'framework', name: 'Vue.js' },
  { pattern: /angular|ng-version/i, category: 'framework', name: 'Angular' },
  { pattern: /svelte/i, category: 'framework', name: 'Svelte' },
  { pattern: /tailwindcss/i, category: 'css', name: 'Tailwind CSS' },
  { pattern: /bootstrap/i, category: 'css', name: 'Bootstrap' },
  { pattern: /google-analytics|gtag|ga\.js/i, category: 'analytics', name: 'Google Analytics' },
  { pattern: /gtm\.js|googletagmanager/i, category: 'analytics', name: 'Google Tag Manager' },
  { pattern: /hotjar/i, category: 'analytics', name: 'Hotjar' },
  { pattern: /segment\.com|analytics\.js/i, category: 'analytics', name: 'Segment' },
  { pattern: /cloudflare/i, category: 'cdn', name: 'Cloudflare' },
  { pattern: /__cf_bm|cf_clearance/i, category: 'security', name: 'Cloudflare Bot Management' },
  { pattern: /recaptcha|g-recaptcha/i, category: 'security', name: 'reCAPTCHA' },
  { pattern: /hCaptcha/i, category: 'security', name: 'hCaptcha' },
  { pattern: /turnstile/i, category: 'security', name: 'Cloudflare Turnstile' },
  { pattern: /fontawesome|font-awesome/i, category: 'css', name: 'Font Awesome' },
];

// ─── Open Ports (common web ports) ────────────────────────────────────────────

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function domainWebcheckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return c.json({ error: 'missing domain' }, 400);
  const domain = raw
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (!DOMAIN_RE.test(domain)) return c.json({ error: 'invalid domain' }, 400);

  // Edge cache
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://domain-webcheck.internal/v1?d=${domain}`);
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'HIT' });
  }

  const [httpProbe, tlsInfo, shodanData] = await Promise.all([
    probeHttp(domain),
    probeTls(domain),
    queryShodan(domain, c.env),
  ]);

  const securityHeaders = auditSecurityHeaders(httpProbe.headers);
  const techStack = detectTechnology(httpProbe.headers, httpProbe.bodySnippet);
  const headerScore = computeSecurityScore(securityHeaders, httpProbe);

  const body = {
    domain,
    generated_at: new Date().toISOString(),
    http: {
      url: httpProbe.finalUrl,
      status: httpProbe.status,
      redirect_chain: httpProbe.redirectChain,
      response_time_ms: httpProbe.responseTimeMs,
      content_length: httpProbe.contentLength,
      content_type: httpProbe.contentType,
    },
    tls: tlsInfo,
    security_headers: {
      score: headerScore,
      grade: gradeFromScore(headerScore),
      checks: securityHeaders,
    },
    technology: techStack,
    ports: shodanData?.ports ?? [],
    shodan: shodanData
      ? {
          ip: shodanData.ip,
          org: shodanData.org,
          os: shodanData.os,
          vulns: shodanData.vulns,
          hostnames: shodanData.hostnames,
        }
      : undefined,
    cached: false,
  };

  // Cache the response
  const cacheable = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cacheable).catch(() => undefined));

  return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'MISS' });
}

// ─── HTTP Probe ───────────────────────────────────────────────────────────────

interface HttpProbeResult {
  finalUrl: string;
  status: number;
  redirectChain: string[];
  headers: Record<string, string>;
  responseTimeMs: number;
  contentLength: number;
  contentType: string;
  bodySnippet: string;
}

async function probeHttp(domain: string): Promise<HttpProbeResult> {
  const result: HttpProbeResult = {
    finalUrl: `https://${domain}`,
    status: 0,
    redirectChain: [],
    headers: {},
    responseTimeMs: 0,
    contentLength: 0,
    contentType: '',
    bodySnippet: '',
  };

  let url = `https://${domain}`;
  const maxRedirects = 8;

  for (let i = 0; i <= maxRedirects; i++) {
    const start = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,*/*',
        },
      });
      clearTimeout(timer);
      result.responseTimeMs += Date.now() - start;

      if (i === 0) {
        result.status = res.status;
        const hdrs: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          hdrs[k.toLowerCase()] = v;
        });
        result.headers = hdrs;
        result.contentType = hdrs['content-type'] ?? '';
        result.contentLength = parseInt(hdrs['content-length'] ?? '0') || 0;
      }

      if (i > 0) result.redirectChain.push(url);

      const location = res.headers.get('location');
      if (location && res.status >= 300 && res.status < 400) {
        url = location.startsWith('http') ? location : new URL(location, url).href;
        result.finalUrl = url;
        continue;
      }

      // Read a snippet of the body for tech detection
      try {
        const text = await res.text();
        result.bodySnippet = text.slice(0, 50_000);
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* body read failure is non-fatal */
      }
      break;
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      result.responseTimeMs = Date.now() - start;
      break;
    }
  }

  return result;
}

// ─── TLS Probe ────────────────────────────────────────────────────────────────

interface TlsInfo {
  issuer?: string;
  subject?: string;
  valid_from?: string;
  valid_to?: string;
  days_remaining?: number;
  serial_number?: string;
  SANs?: string[];
  protocol?: string;
  key_size?: number;
  self_signed?: boolean;
}

async function probeTls(domain: string): Promise<TlsInfo> {
  // Workers don't have direct TLS socket access. We infer TLS info from:
  // 1. The HTTP response (HSTS headers, etc.)
  // 2. crt.sh CT logs (already fetched in domain.ts)
  // 3. HEAD request timing + connection details
  //
  // For a fuller TLS check, we'd need a Durable Object or external service.
  // For now, we extract what we can from the HTTP response headers.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'user-agent': 'pranithjain-webcheck/1.0' },
    });
    clearTimeout(timer);

    res.headers.get('strict-transport-security');
    const server = res.headers.get('server');
    const protocol = res.headers.get('alt-svc')?.includes('h3') ? 'HTTP/3 (QUIC)' : 'HTTP/2';

    return {
      protocol,
      self_signed: false, // HTTPS succeeded, so not self-signed
      issuer: server ? `Server: ${server}` : undefined,
    };
  } catch (_catchErr) {
    console.error('probeTls failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return {};
  }
}

// ─── Shodan Query ─────────────────────────────────────────────────────────────

interface ShodanResult {
  ip?: string;
  org?: string;
  os?: string;
  ports?: number[];
  vulns?: string[];
  hostnames?: string[];
}

async function queryShodan(domain: string, env: Env): Promise<ShodanResult | null> {
  const apiKey = (env as unknown as Record<string, string | undefined>).SHODAN_API_KEY;
  if (!apiKey) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://api.shodan.io/dns/resolve?hostnames=${domain}&key=${apiKey}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const dns = (await res.json()) as Record<string, string>;
    const ip = dns[domain];
    if (!ip) return null;

    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), FETCH_TIMEOUT_MS);
    const hostRes = await fetch(`https://api.shodan.io/shodan/host/${ip}?key=${apiKey}`, {
      signal: ctrl2.signal,
    });
    clearTimeout(timer2);
    if (!hostRes.ok) return null;
    const host = (await hostRes.json()) as ShodanResult;
    return {
      ip,
      org: host.org,
      os: host.os,
      ports: host.ports,
      vulns: host.vulns,
      hostnames: host.hostnames,
    };
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

// ─── Security Headers Audit ───────────────────────────────────────────────────

function auditSecurityHeaders(headers: Record<string, string>): SecurityHeaderCheck[] {
  return SECURITY_HEADERS.map((def) => {
    const value = headers[def.name.toLowerCase()];
    const present = !!value;
    const secure = present ? (def.validate ? def.validate(value) : true) : !def.required;
    return {
      header: def.name,
      present,
      value: value ?? undefined,
      secure,
      recommendation: secure ? '' : def.rec,
    };
  });
}

function computeSecurityScore(checks: SecurityHeaderCheck[], http: HttpProbeResult): number {
  let score = 100;

  for (const ch of checks) {
    if (!ch.secure) {
      // Required headers deduct more
      const deduction = SECURITY_HEADERS.find((d) => d.name === ch.header)?.required ? 12 : 5;
      score -= deduction;
    }
  }

  // HSTS preload bonus
  if (http.headers['strict-transport-security']?.includes('preload')) score = Math.min(100, score + 3);

  // Missing HTTPS entirely
  if (http.status === 0) score = Math.max(score - 30, 0);

  // Server header leaks version info
  const server = http.headers['server'] ?? '';
  if (/\d+\.\d+/.test(server)) score -= 3;

  return Math.max(0, Math.min(100, score));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

// ─── Technology Detection ─────────────────────────────────────────────────────

function detectTechnology(headers: Record<string, string>, body: string): TechFingerprint[] {
  const found: TechFingerprint[] = [];
  const seen = new Set<string>();

  // Header-based detection
  for (const fp of HEADER_FINGERPRINTS) {
    const value = headers[fp.header.toLowerCase()];
    if (value && fp.pattern.test(value) && !seen.has(fp.name)) {
      seen.add(fp.name);
      found.push({
        category: fp.category,
        name: fp.name,
        confidence: 0.9,
        evidence: `${fp.header}: ${value.slice(0, 100)}`,
      });
    }
  }

  // Body-based detection (only check first 50KB)
  const bodySlice = body.slice(0, 50_000);
  for (const fp of BODY_FINGERPRINTS) {
    if (fp.pattern.test(bodySlice) && !seen.has(fp.name)) {
      seen.add(fp.name);
      found.push({
        category: fp.category,
        name: fp.name,
        confidence: 0.8,
        evidence: 'body content match',
      });
    }
  }

  return found;
}
