import type { Context } from 'hono';
import type { Env } from '../env';
import { pinnedFetch, pinnedFetchFollow } from '../lib/ssrf-guard';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

const URL_RE = /^https?:\/\/.+/i;

// Per-colo shadow for the radar list + individual scan reads. KV is metered
// (Free plan: ~1k reads/day); the per-colo Cache API is free. A scan result
// is typically re-fetched 2-5x in the same colo within seconds (SSR + client
// hydration + retries), so shadowing collapses that to ~1 KV read per colo
// per TTL. TTL tracks KV so coherency is automatic. The list shadow also
// debounces the read-modify-write in the scan handler so burst scans don't
// re-serialize the full 100-entry list on every successful scan.
const RADAR_SCAN_TTL = 3600;
const RADAR_LIST_TTL = 86400;
const RADAR_LIST_DEBOUNCE_S = 30;
const RADAR_SCAN_SHADOW = (id: string) => new Request(`https://radar-scan-cache.internal/v1/${id}`);
const RADAR_LIST_SHADOW = new Request('https://radar-list-cache.internal/v1');
function radarCacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}
async function readRadarScanShadow(id: string): Promise<RadarScanResult | null> {
  const cache = radarCacheApi();
  if (!cache) return null;
  try {
    const hit = await cache.match(RADAR_SCAN_SHADOW(id));
    if (!hit) return null;
    return (await hit.json()) as RadarScanResult;
  } catch {
    return null;
  }
}
async function writeRadarScanShadow(id: string, value: RadarScanResult): Promise<void> {
  const cache = radarCacheApi();
  if (!cache) return;
  try {
    await cache.put(
      RADAR_SCAN_SHADOW(id),
      new Response(JSON.stringify(value), {
        headers: { 'cache-control': `max-age=${RADAR_SCAN_TTL}` },
      })
    );
  } catch {
    /* best-effort */
  }
}
async function readRadarListShadow(): Promise<Array<{
  id: string;
  target: string;
  scannedAt: string;
  status: number;
}> | null> {
  const cache = radarCacheApi();
  if (!cache) return null;
  try {
    const hit = await cache.match(RADAR_LIST_SHADOW);
    if (!hit) return null;
    return (await hit.json()) as Array<{ id: string; target: string; scannedAt: string; status: number }>;
  } catch {
    return null;
  }
}
async function writeRadarListShadow(
  value: Array<{ id: string; target: string; scannedAt: string; status: number }>
): Promise<void> {
  const cache = radarCacheApi();
  if (!cache) return;
  try {
    await cache.put(
      RADAR_LIST_SHADOW,
      new Response(JSON.stringify(value), {
        headers: { 'cache-control': `max-age=${RADAR_LIST_TTL}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

interface RadarScanResult {
  id: string;
  target: string;
  scannedAt: string;
  duration_ms: number;
  http: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    redirectChain: string[];
    finalUrl: string;
    contentType: string;
    server: string;
    contentLength: number;
  };
  dns: {
    a: string[];
    aaaa: string[];
    ns: string[];
    mx: { host: string; priority: number }[];
    txt: string[];
    cname: string[];
  };
  tls: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    serialNumber: string;
    sans: string[];
  } | null;
  technologies: { name: string; category: string; confidence: number }[];
  js_files: { url: string; size: number; type: string }[];
  endpoints: { url: string; method: string; type: string }[];
  meta: Record<string, string>;
  forms: { action: string; method: string; inputs: { name: string; type: string }[] }[];
  images: { src: string; alt: string; width?: number; height?: number }[];
  links: { href: string; text: string; rel?: string }[];
  security: {
    headers: Record<string, string | null>;
    score: number;
    issues: string[];
  };
  emails: string[];
  guids: string[];
  localhost_refs: string[];
  social_media_urls: string[];
  file_extension_urls: string[];
  parameters: string[];
  query_parameters: string[];
  scanned_urls: string[];
  api_paths: string[];
  domains: string[];
  ip_addresses: string[];
  aws_assets: { type: string; url: string; status?: number }[];
  s3_takeovers: string[];
  node_modules: string[];
  npm_confusion: string[];
  vulnerabilities: { type: string; detail: string; severity: string }[];
  graphql: { queries: string[]; mutations: string[]; fragments: string[] };
  filtered_port_urls: string[];
  directory_listings?: string[];
  backup_files?: string[];
  debug_endpoints?: string[];
  open_redirects?: string[];
  sensitive_files?: string[];
  source_maps?: string[];
  cors_issues?: string[];
  cookie_issues?: string[];
  waf_detected?: string[];
  jwt_tokens?: string[];
  html_comments?: string[];
  hidden_forms?: string[];
  tech_hints?: string[];
  robots_disallow?: string[];
  sitemap_urls?: string[];
}

function generateId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function dnsLookup(domain: string): Promise<RadarScanResult['dns']> {
  const dohUrl = 'https://cloudflare-dns.com/dns-query';
  const headers = { accept: 'application/dns-json' };

  const query = async (type: number) => {
    try {
      const res = await pinnedFetch(`${dohUrl}?name=${domain}&type=${type}`, { headers });
      if (!res.ok) return null;
      return (await res.json()) as { Answer?: { name: string; type: number; data: string; TTL: number }[] };
    } catch {
      return null;
    }
  };

  const [aRes, aaaaRes, nsRes, mxRes, txtRes, cnameRes] = await Promise.all([
    query(1),
    query(28),
    query(2),
    query(15),
    query(16),
    query(5),
  ]);

  return {
    a: aRes?.Answer?.filter((r) => r.type === 1).map((r) => r.data) ?? [],
    aaaa: aaaaRes?.Answer?.filter((r) => r.type === 28).map((r) => r.data) ?? [],
    ns: nsRes?.Answer?.filter((r) => r.type === 2).map((r) => r.data) ?? [],
    mx:
      mxRes?.Answer?.filter((r) => r.type === 15).map((r) => {
        const parts = r.data.split(' ');
        return { host: parts[1] ?? r.data, priority: parseInt(parts[0] ?? '10', 10) };
      }) ?? [],
    txt: txtRes?.Answer?.filter((r) => r.type === 16).map((r) => r.data.replace(/^"|"$/g, '')) ?? [],
    cname: cnameRes?.Answer?.filter((r) => r.type === 5).map((r) => r.data) ?? [],
  };
}

function detectTechnologies(html: string, headers: Record<string, string>): RadarScanResult['technologies'] {
  const techs: RadarScanResult['technologies'] = [];
  const checks: [RegExp, string, string, number][] = [
    [/react[.\s/]|__react|data-reactroot|data-reactid/i, 'React', 'Framework', 90],
    [/vue[.\s/]|__vue|v-cloak|v-bind|v-model|data-v-/i, 'Vue.js', 'Framework', 90],
    [/angular[.\s/]|ng-version|ng-app|data-ng|ng-controller/i, 'Angular', 'Framework', 90],
    [/next[.\s/]|__next|_next\//i, 'Next.js', 'Framework', 85],
    [/nuxt[.\s/]|__nuxt|_nuxt\//i, 'Nuxt.js', 'Framework', 85],
    [/svelte/i, 'Svelte', 'Framework', 85],
    [/jquery|jQuery/i, 'jQuery', 'Library', 80],
    [/bootstrap/i, 'Bootstrap', 'CSS Framework', 80],
    [/tailwind/i, 'Tailwind CSS', 'CSS Framework', 75],
    [/wordpress|wp-content|wp-includes/i, 'WordPress', 'CMS', 90],
    [/drupal/i, 'Drupal', 'CMS', 85],
    [/joomla/i, 'Joomla', 'CMS', 85],
    [/shopify|cdn\.shopify/i, 'Shopify', 'E-Commerce', 90],
    [/woocommerce/i, 'WooCommerce', 'E-Commerce', 85],
    [/magento/i, 'Magento', 'E-Commerce', 85],
    [/laravel|laravel_session/i, 'Laravel', 'Framework', 85],
    [/django/i, 'Django', 'Framework', 80],
    [/rails|ruby-on-rails/i, 'Ruby on Rails', 'Framework', 80],
    [/cloudflare|cf-ray/i, 'Cloudflare', 'CDN', 85],
    [/akamai/i, 'Akamai', 'CDN', 80],
    [/cloudfront/i, 'CloudFront', 'CDN', 80],
    [/fastly/i, 'Fastly', 'CDN', 80],
    [/vercel|__vercel/i, 'Vercel', 'Hosting', 85],
    [/netlify/i, 'Netlify', 'Hosting', 80],
    [/firebase/i, 'Firebase', 'Backend', 80],
    [/gtag|google-analytics|googletagmanager|ga\(/i, 'Google Analytics', 'Analytics', 80],
    [/gtm\.js|googletagmanager/i, 'Google Tag Manager', 'Tag Manager', 85],
    [/facebook.*pixel|fbq\(/i, 'Facebook Pixel', 'Analytics', 75],
    [/hotjar/i, 'Hotjar', 'Analytics', 80],
    [/intercom/i, 'Intercom', 'Chat', 80],
    [/hubspot/i, 'HubSpot', 'Marketing', 80],
    [/recaptcha|grecaptcha/i, 'reCAPTCHA', 'Security', 85],
    [/turnstile|cf-turnstile/i, 'Turnstile', 'Security', 85],
    [/nginx/i, 'Nginx', 'Web Server', 80],
    [/apache/i, 'Apache', 'Web Server', 80],
    [/iis/i, 'IIS', 'Web Server', 80],
    [/node\.?js|x-powered-by.*express/i, 'Node.js', 'Runtime', 80],
    [/php/i, 'PHP', 'Runtime', 75],
    [/asp\.net|x-aspnet/i, 'ASP.NET', 'Runtime', 80],
  ];

  for (const [re, name, category, confidence] of checks) {
    if (re.test(html) || re.test(headers['x-powered-by'] ?? '') || re.test(headers['server'] ?? '')) {
      techs.push({ name, category, confidence });
    }
  }
  return techs;
}

function extractJsFiles(html: string, baseUrl: string): RadarScanResult['js_files'] {
  const scriptRe = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
  const files: RadarScanResult['js_files'] = [];
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    let src = raw;
    try {
      src = new URL(src, baseUrl).href;
    } catch {
      continue;
    }
    files.push({ url: src, size: 0, type: 'application/javascript' });
  }
  return files;
}

function extractEndpoints(html: string, _baseUrl: string): RadarScanResult['endpoints'] {
  const endpoints: RadarScanResult['endpoints'] = [];
  const seen = new Set<string>();

  const linkRe = /href=["'](\/[^"']*?)[^"']*?'/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const url = m[1] ?? '';
    if (url && !seen.has(url)) {
      seen.add(url);
      endpoints.push({ url, method: 'GET', type: 'link' });
    }
  }

  const actionRe = /action=["'](\/[^"']*?)["']/gi;
  while ((m = actionRe.exec(html)) !== null) {
    const url = m[1] ?? '';
    if (url && !seen.has(url)) {
      seen.add(url);
      endpoints.push({ url, method: 'POST', type: 'form' });
    }
  }

  const apiRe = /["'](https?:\/\/[^"']*?api[^"']*?)["']/gi;
  while ((m = apiRe.exec(html)) !== null) {
    const url = m[1] ?? '';
    if (url && !seen.has(url)) {
      seen.add(url);
      endpoints.push({ url, method: 'GET', type: 'api' });
    }
  }

  return endpoints;
}

function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const re = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = m[1];
    const val = m[2];
    if (key !== undefined && val !== undefined) meta[key] = val;
  }
  const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']([^"']+)["'][^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    const val = m[1];
    const key = m[2];
    if (key !== undefined && val !== undefined) meta[key] = val;
  }
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (titleMatch?.[1]) meta['title'] = titleMatch[1].trim();
  return meta;
}

function extractForms(html: string): RadarScanResult['forms'] {
  const forms: RadarScanResult['forms'] = [];
  const formRe = /<form[^>]*>/gi;
  const inputRe = /<input[^>]*>/gi;
  let m;
  while ((m = formRe.exec(html)) !== null) {
    const tag = m[0];
    const action = /(?:action)=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    const method = /(?:method)=["']([^"']*)["']/i.exec(tag)?.[1]?.toUpperCase() ?? 'GET';
    const formEnd = html.indexOf('</form>', m.index);
    const formHtml = formEnd > m.index ? html.slice(m.index, formEnd) : html.slice(m.index, m.index + 2000);
    const inputs: { name: string; type: string }[] = [];
    let im;
    while ((im = inputRe.exec(formHtml)) !== null) {
      const name = /(?:name)=["']([^"']*)["']/i.exec(im[0])?.[1] ?? '';
      const type = /(?:type)=["']([^"']*)["']/i.exec(im[0])?.[1] ?? 'text';
      if (name) inputs.push({ name, type });
    }
    inputRe.lastIndex = 0;
    forms.push({ action, method, inputs });
  }
  return forms;
}

function extractImages(html: string): RadarScanResult['images'] {
  const images: RadarScanResult['images'] = [];
  const re = /<img[^>]+>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = /(?:src)=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    const alt = /(?:alt)=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    const w = /(?:width)=["'](\d+)["']/i.exec(tag)?.[1];
    const h = /(?:height)=["'](\d+)["']/i.exec(tag)?.[1];
    if (src) images.push({ src, alt, width: w ? parseInt(w) : undefined, height: h ? parseInt(h) : undefined });
  }
  return images;
}

function extractLinks(html: string): RadarScanResult['links'] {
  const links: RadarScanResult['links'] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1] ?? '';
    const text = (m[2] ?? '').trim();
    const rel = /(?:rel)=["']([^"']*)["']/i.exec(m[0])?.[1];
    if (href) links.push({ href, text, rel: rel || undefined });
  }
  return links;
}

function analyzeSecurityHeaders(headers: Record<string, string>): RadarScanResult['security'] {
  const securityHeaders: Record<string, string | null> = {
    'strict-transport-security': headers['strict-transport-security'] ?? null,
    'content-security-policy': headers['content-security-policy'] ?? null,
    'x-content-type-options': headers['x-content-type-options'] ?? null,
    'x-frame-options': headers['x-frame-options'] ?? null,
    'x-xss-protection': headers['x-xss-protection'] ?? null,
    'referrer-policy': headers['referrer-policy'] ?? null,
    'permissions-policy': headers['permissions-policy'] ?? null,
    'cross-origin-embedder-policy': headers['cross-origin-embedder-policy'] ?? null,
    'cross-origin-opener-policy': headers['cross-origin-opener-policy'] ?? null,
    'cross-origin-resource-policy': headers['cross-origin-resource-policy'] ?? null,
  };
  const issues: string[] = [];
  let score = 100;
  if (!securityHeaders['strict-transport-security']) {
    issues.push('Missing HSTS header');
    score -= 15;
  }
  if (!securityHeaders['content-security-policy']) {
    issues.push('Missing CSP header');
    score -= 15;
  }
  if (!securityHeaders['x-content-type-options']) {
    issues.push('Missing X-Content-Type-Options');
    score -= 10;
  }
  if (!securityHeaders['x-frame-options'] && !securityHeaders['content-security-policy']?.includes('frame-ancestors')) {
    issues.push('Missing X-Frame-Options or CSP frame-ancestors');
    score -= 10;
  }
  if (!securityHeaders['referrer-policy']) {
    issues.push('Missing Referrer-Policy');
    score -= 5;
  }
  if (!securityHeaders['permissions-policy']) {
    issues.push('Missing Permissions-Policy');
    score -= 5;
  }
  return { headers: securityHeaders, score: Math.max(0, score), issues };
}

/* ── NEW: Easy recon extractors ──────────────────────────────────── */

function extractEmails(html: string): string[] {
  const emails = new Set<string>();
  const re = /(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && !m[1].includes('{') && !m[1].includes('example.') && !m[1].includes('email@')) {
      emails.add(m[1].toLowerCase());
    }
  }
  return [...emails];
}

function extractGuids(html: string): string[] {
  const guids = new Set<string>();
  const re = /["'=\s]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) guids.add(m[1]);
  }
  return [...guids];
}

function extractLocalhostRefs(html: string): string[] {
  const refs = new Set<string>();
  const re = /(?:https?:\/\/)?localhost(?::\d+)?(?:\/[^\s"'<>]*)?/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0]) refs.add(m[0]);
  }
  return [...refs];
}

function extractSocialMediaUrls(html: string): string[] {
  const urls = new Set<string>();
  const patterns = [
    /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?twitter\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?x\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?reddit\.com\/[^\s"'<>]+/gi,
    /https?:\/\/t\.me\/[^\s"'<>]+/gi,
    /https?:\/\/(?:www\.)?github\.com\/[^\s"'<>]+/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[0]) urls.add(m[0].replace(/[.,;:!?)]+$/, ''));
    }
  }
  return [...urls];
}

function extractFileExtensionUrls(html: string): string[] {
  const urls = new Set<string>();
  const re =
    /["'](https?:\/\/[^"']+?\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|csv|zip|tar\.gz|rar|7z|apk|ipa|dmg|exe|msi|deb|rpm|xml|json|yaml|yml|toml|env|bak|old|swp|sql|db|sqlite|log|conf|config|ini|htaccess|htpasswd|pem|key|crt|cer|p12|pfx))["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) urls.add(m[1]);
  }
  return [...urls];
}

function extractParameters(html: string): string[] {
  const params = new Set<string>();
  const re = /[?&](\w+)=/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].length > 1 && !['utm', 'fb', 'ref', 'src', 'id'].includes(m[1])) {
      params.add(m[1]);
    }
  }
  return [...params];
}

function extractQueryParameters(html: string, baseUrl: string): string[] {
  const params = new Set<string>();
  const urlRe = /["'](https?:\/\/[^"'\s<>]+?\?[^"'\s<>]+)["']/gi;
  let m;
  while ((m = urlRe.exec(html)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    try {
      const u = new URL(raw);
      u.searchParams.forEach((_v, k) => params.add(k));
    } catch {
      /* skip */
    }
  }
  try {
    const u = new URL(baseUrl);
    u.searchParams.forEach((_v, k) => params.add(k));
  } catch {
    /* skip */
  }
  return [...params];
}

function extractApiPaths(html: string, jsContent: string): string[] {
  const paths = new Set<string>();
  const combined = html + '\n' + jsContent;

  const restRe = /["'`](\/api\/v\d+\/[a-zA-Z0-9/_\-{}:.]+)["'`]/g;
  let m;
  while ((m = restRe.exec(combined)) !== null) {
    if (m[1]) paths.add(m[1]);
  }

  const graphqlRe = /["'`](\/graphql(?:\/[a-zA-Z0-9/_-]+)?)["'`]/gi;
  while ((m = graphqlRe.exec(combined)) !== null) {
    if (m[1]) paths.add(m[1]);
  }

  const pathRe = /["'`](\/[a-zA-Z0-9/_-]+\/(?:api|v\d+|graphql|query|mutation)[a-zA-Z0-9/_-]*)["'`]/gi;
  while ((m = pathRe.exec(combined)) !== null) {
    if (m[1]) paths.add(m[1]);
  }

  return [...paths];
}

function extractDomains(html: string, baseDomain: string): string[] {
  const domains = new Set<string>();
  const urlRe = /https?:\/\/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/gi;
  let m;
  while ((m = urlRe.exec(html)) !== null) {
    try {
      const u = new URL(m[0]);
      const host = u.hostname.toLowerCase();
      if (
        host &&
        !host.endsWith(baseDomain.replace(/^\./, '')) &&
        !host.includes('example.') &&
        !host.includes('email@')
      ) {
        domains.add(host);
      }
    } catch {
      /* skip */
    }
  }
  return [...domains];
}

function extractIps(html: string, dnsResult: RadarScanResult['dns']): string[] {
  const ips = new Set<string>([...dnsResult.a, ...dnsResult.aaaa]);
  const re = /(?:https?:\/\/)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/|["'\s]|$)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && !m[1].startsWith('0.') && m[1] !== '0.0.0.0') ips.add(m[1]);
  }
  return [...ips];
}

function extractNodeModules(html: string): string[] {
  const refs = new Set<string>();
  const re = /["'](\/node_modules\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) refs.add(m[1]);
  }
  const re2 = /node_modules[/\\][a-z@\w.-]+/gi;
  while ((m = re2.exec(html)) !== null) {
    if (m[0]) refs.add(m[0]);
  }
  return [...refs];
}

function extractGraphql(html: string, jsContent: string): RadarScanResult['graphql'] {
  const combined = html + '\n' + jsContent;
  const queries: string[] = [];
  const mutations: string[] = [];
  const fragments: string[] = [];

  const queryRe = /query\s+(\w+)(?:\s*\([^)]*\))?\s*\{[^}]{0,500}\}/gi;
  let m;
  while ((m = queryRe.exec(combined)) !== null) {
    if (m[1]) queries.push(m[1]);
  }

  const mutRe = /mutation\s+(\w+)(?:\s*\([^)]*\))?\s*\{[^}]{0,500}\}/gi;
  while ((m = mutRe.exec(combined)) !== null) {
    if (m[1]) mutations.push(m[1]);
  }

  const fragRe = /fragment\s+(\w+)\s+on\s+(\w+)/gi;
  while ((m = fragRe.exec(combined)) !== null) {
    if (m[1]) fragments.push(`${m[1]} on ${m[2]}`);
  }

  return { queries: [...new Set(queries)], mutations: [...new Set(mutations)], fragments: [...new Set(fragments)] };
}

function extractVulnerabilities(
  html: string,
  headers: Record<string, string>,
  techs: RadarScanResult['technologies']
): RadarScanResult['vulnerabilities'] {
  const vulns: RadarScanResult['vulnerabilities'] = [];

  if (headers['x-powered-by']?.includes('Express') && !html.includes('helmet')) {
    vulns.push({
      type: 'Missing Security Middleware',
      detail: 'Express.js without helmet detected',
      severity: 'medium',
    });
  }
  if (html.includes('version') && /jQuery\s+\d+\.\d+\.\d+/.test(html)) {
    const verMatch = /jQuery\s+(\d+\.\d+\.\d+)/.exec(html);
    const ver = verMatch?.[1];
    if (ver && parseFloat(ver.split('.')[0] ?? '0') < 3) {
      vulns.push({ type: 'Outdated Library', detail: `jQuery ${ver} (known XSS vulnerabilities)`, severity: 'high' });
    }
  }
  if (html.includes('ng-app') && !html.includes('ng-csp')) {
    vulns.push({ type: 'Angular Debug Mode', detail: 'AngularJS ng-app without CSP mode', severity: 'low' });
  }
  if (!headers['x-content-type-options']) {
    vulns.push({ type: 'MIME Sniffing', detail: 'Missing X-Content-Type-Options: nosniff', severity: 'medium' });
  }
  if (html.match(/<input[^>]*type=["']?hidden["']?[^>]*value=["'][^"']*\.(?:key|secret|token|password)/i)) {
    vulns.push({ type: 'Sensitive Data in HTML', detail: 'Hidden input with sensitive value', severity: 'high' });
  }
  if (html.match(/password\s*[:=]\s*["'][^"']{4,}/i)) {
    vulns.push({ type: 'Hardcoded Password', detail: 'Potential hardcoded password in source', severity: 'critical' });
  }
  if (html.match(/api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{16,}/i)) {
    vulns.push({ type: 'Exposed API Key', detail: 'Potential API key in page source', severity: 'critical' });
  }
  if (html.match(/access[_-]?token\s*[:=]\s*["'][A-Za-z0-9\-._~+/]+=*/i)) {
    vulns.push({ type: 'Exposed Access Token', detail: 'Potential access token in page source', severity: 'critical' });
  }
  if (html.match(/private[_-]?key\s*[:=]\s*["']/i)) {
    vulns.push({ type: 'Exposed Private Key', detail: 'Potential private key in page source', severity: 'critical' });
  }
  if (techs.some((t) => t.name === 'WordPress') && html.includes('/wp-admin/install.php')) {
    vulns.push({ type: 'WordPress Install Page', detail: 'WordPress install page is accessible', severity: 'high' });
  }
  if (html.includes('.env') || html.includes('config.json') || html.includes('credentials.json')) {
    vulns.push({
      type: 'Config File Reference',
      detail: 'Sensitive config file referenced in page',
      severity: 'medium',
    });
  }
  if (!headers['content-security-policy'] && html.includes('<script')) {
    vulns.push({ type: 'No CSP', detail: 'No Content-Security-Policy with script tags present', severity: 'medium' });
  }

  return vulns;
}

function extractFilteredPortUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /["'](https?:\/\/[^"'\s<>]*:\d{2,5}[^"'\s<>]*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) urls.add(m[1]);
  }
  return [...urls];
}

/* ── NEW: Attack surface extractors (from mattew) ─────────────────────── */

function extractDirectoryListings(html: string, url: string): string[] {
  const patterns = [
    /<title>Index of \//i,
    /<h1>Index of \//i,
    /Parent Directory<\/a>/i,
    /<pre><a href=.*?>\.\.\/<\/a>/i,
    /Directory listing for/i,
  ];
  for (const re of patterns) {
    if (re.test(html)) return [url];
  }
  return [];
}

function extractBackupFiles(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const exts = ['.bak', '.backup', '.old', '.orig', '.save', '.swp', '.sql', '.sql.gz'];
  const names = [
    'backup.sql',
    'dump.sql',
    'database.sql',
    'backup.zip',
    'backup.tar.gz',
    'site.zip',
    'www.zip',
    '.env.backup',
    '.env.old',
    '.env.local',
    '.env.production',
    'credentials.json',
    'secrets.json',
  ];

  for (const ext of exts) {
    const re = new RegExp(`href=["']([^"']*${ext.replace(/\./g, '\\.')}[^"']*)["']`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[1]) {
        try {
          urls.add(new URL(m[1], baseUrl).href);
        } catch {
          /* skip */
        }
      }
    }
  }
  for (const name of names) {
    if (html.toLowerCase().includes(name)) {
      const re = new RegExp(`["']([^"']*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["']`, 'gi');
      const m = re.exec(html);
      if (m?.[1]) {
        try {
          urls.add(new URL(m[1], baseUrl).href);
        } catch {
          /* skip */
        }
      }
    }
  }
  return [...urls];
}

function extractDebugEndpoints(html: string, baseUrl: string): string[] {
  const endpoints = [
    '/debug',
    '/debug/vars',
    '/debug/pprof',
    '/admin',
    '/adminer.php',
    '/phpinfo.php',
    '/info.php',
    '/.env',
    '/.env.local',
    '/.env.production',
    '/actuator',
    '/actuator/env',
    '/actuator/health',
    '/swagger-ui',
    '/swagger-ui.html',
    '/api-docs',
    '/swagger.json',
    '/graphql',
    '/graphiql',
    '/playground',
    '/console',
    '/manage',
    '/phpmyadmin',
    '/wp-admin',
    '/wp-login.php',
  ];
  const found: string[] = [];
  for (const ep of endpoints) {
    const escaped = ep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`["'][^"']*${escaped}[^"']*["']`, 'i');
    if (re.test(html)) {
      try {
        found.push(new URL(ep, baseUrl).href);
      } catch {
        /* skip */
      }
    }
  }
  return found;
}

function extractOpenRedirects(html: string): string[] {
  const findings: string[] = [];
  const params = [
    'redirect',
    'redirect_url',
    'redirect_uri',
    'return_url',
    'return_to',
    'next',
    'continue',
    'dest',
    'destination',
    'goto',
    'url',
    'ref',
  ];
  for (const param of params) {
    const esc = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`action=["'][^"']*${esc}[^"']*["']`, 'i').test(html)) {
      findings.push(`form:${param}`);
    }
    if (
      new RegExp(`(?:window\\.location|location\\.href|location\\.replace)\\s*[=(]\\s*['"\`][^'"]*${esc}`, 'i').test(
        html
      )
    ) {
      findings.push(`js:${param}`);
    }
  }
  return findings;
}

function extractSensitiveFiles(html: string): string[] {
  const paths = [
    '/.env',
    '/.git/config',
    '/.git/HEAD',
    '/.htaccess',
    '/.htpasswd',
    '/wp-config.php.bak',
    '/config.php.bak',
    '/database.sql',
    '/backup.sql',
    '/docker-compose.yml',
    '/Dockerfile',
    '/.npmrc',
    '/server.key',
    '/server.crt',
    '/.well-known/security.txt',
    '/web.config',
  ];
  const found: string[] = [];
  for (const path of paths) {
    if (html.toLowerCase().includes(path)) found.push(path);
  }
  return found;
}

function extractSourceMaps(html: string, baseUrl: string): string[] {
  const maps = new Set<string>();
  const re1 = /\/\/#\s*sourceMappingURL=(\S+)/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    if (m[1]) {
      try {
        maps.add(m[1].startsWith('http') ? m[1] : new URL(m[1], baseUrl).href);
      } catch {
        /* skip */
      }
    }
  }
  const re2 = /["']([^"']*\.js\.map)["']/gi;
  while ((m = re2.exec(html)) !== null) {
    if (m[1]) {
      try {
        maps.add(m[1].startsWith('http') ? m[1] : new URL(m[1], baseUrl).href);
      } catch {
        /* skip */
      }
    }
  }
  return [...maps];
}

function detectWaf(headers: Record<string, string>, html: string): string | null {
  const combined =
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n') +
    '\n' +
    html;
  const wafs: [RegExp, string][] = [
    [/cloudflare/i, 'Cloudflare'],
    [/incapsula|imperva/i, 'Incapsula/Imperva'],
    [/akamaighost/i, 'Akamai'],
    [/awselb|aws.*waf/i, 'AWS WAF'],
    [/Sucuri/i, 'Sucuri'],
    [/ModSecurity/i, 'ModSecurity'],
    [/server.*bigip|BIGip/i, 'F5 BIG-IP'],
  ];
  for (const [re, name] of wafs) {
    if (re.test(combined)) return name;
  }
  return null;
}

function analyzeCors(headers: Record<string, string>): string[] {
  const issues: string[] = [];
  const acao = headers['access-control-allow-origin'] ?? '';
  if (acao === '*') issues.push('CORS wildcard — any origin can read responses');
  else if (acao) {
    const acac = headers['access-control-allow-credentials'] ?? '';
    if (acac.toLowerCase() === 'true') issues.push(`CORS credentials+origin reflection: ${acao}`);
  }
  return issues;
}

function analyzeCookies(headers: Record<string, string>): string[] {
  const issues: string[] = [];
  const setCookie = headers['set-cookie'] ?? '';
  if (!setCookie) return issues;
  const cookies = setCookie.split('\n').filter((c) => c.trim());
  for (const cookie of cookies) {
    const name = cookie.split('=')[0]?.trim() ?? '';
    const lc = cookie.toLowerCase();
    const missing: string[] = [];
    if (!lc.includes('secure')) missing.push('Secure');
    if (!lc.includes('httponly')) missing.push('HttpOnly');
    if (!lc.includes('samesite')) missing.push('SameSite');
    const isSession = ['session', 'sid', 'token', 'auth', 'jwt'].some((w) => name.toLowerCase().includes(w));
    if (missing.length > 0 && (isSession || missing.length >= 2)) {
      issues.push(`${name}: missing ${missing.join(', ')}`);
    }
  }
  return issues;
}

function analyzeHtmlComments(html: string): string[] {
  const findings: string[] = [];
  const re = /<!--([\s\S]*?)-->/gi;
  const kws = ['todo', 'fixme', 'hack', 'password', 'secret', 'token', 'admin', 'debug', 'internal'];
  let m;
  while ((m = re.exec(html)) !== null) {
    const comment = m[1]?.trim();
    if (comment && comment.length >= 5 && kws.some((kw) => comment.toLowerCase().includes(kw))) {
      findings.push(comment.slice(0, 120));
    }
  }
  return findings;
}

function detectJwts(html: string): string[] {
  const tokens: string[] = [];
  const re = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!tokens.includes(m[0])) tokens.push(m[0]);
  }
  return tokens;
}

async function fetchRobotsTxt(domain: string): Promise<string[]> {
  const paths: string[] = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await pinnedFetchFollow(`https://${domain}/robots.txt`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; security-research)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return paths;
    const content = await res.text();
    const disallowRe = /Disallow:\s*(.+)/gi;
    let m;
    while ((m = disallowRe.exec(content)) !== null) {
      const path = m[1]?.trim();
      if (path && path !== '/') paths.push(path);
    }
    // Also extract sitemap references
    const sitemapRe = /Sitemap:\s*(\S+)/gi;
    while ((m = sitemapRe.exec(content)) !== null) {
      if (m[1]) paths.push(`sitemap:${m[1]}`);
    }
  } catch {
    /* skip */
  }
  return paths;
}

async function fetchSitemapUrls(domain: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await pinnedFetchFollow(`https://${domain}/sitemap.xml`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; security-research)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return urls;
    const content = await res.text();
    const locRe = /<loc>\s*(.*?)\s*<\/loc>/gi;
    let m;
    while ((m = locRe.exec(content)) !== null) {
      if (m[1]?.trim()) urls.push(m[1].trim());
      if (urls.length >= 200) break;
    }
  } catch {
    /* skip */
  }
  return urls;
}

/* ── Medium: async recon via additional fetches ──────────────────── */

async function fetchSubdomainsViaCT(domain: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await pinnedFetch(`https://crt.sh/?q=%25.${domain}&output=json`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ name_value?: string }>;
    const subs = new Set<string>();
    for (const entry of data) {
      if (entry.name_value) {
        for (const name of entry.name_value.split('\n')) {
          const trimmed = name.trim().toLowerCase();
          if (trimmed && !trimmed.startsWith('*') && trimmed.includes('.')) {
            subs.add(trimmed);
          }
        }
      }
    }
    return [...subs].slice(0, 500);
  } catch {
    return [];
  }
}

async function checkS3Buckets(domain: string): Promise<RadarScanResult['aws_assets']> {
  const baseName = domain.split('.')[0];
  const bucketNames = [
    `${baseName}`,
    `${baseName}-assets`,
    `${baseName}-backup`,
    `${baseName}-staging`,
    `${baseName}-dev`,
    `${baseName}-public`,
    `${baseName}-static`,
    `${baseName}-media`,
  ];

  const results: RadarScanResult['aws_assets'] = [];
  const checks = bucketNames.map(async (name) => {
    const url = `https://${name}.s3.amazonaws.com/`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await pinnedFetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 200 || res.status === 403) {
        results.push({ type: 'S3 Bucket', url, status: res.status });
      }
    } catch {
      /* skip */
    }
  });

  await Promise.all(checks);
  return results;
}

async function checkNodeModulesExposure(baseUrl: string): Promise<string[]> {
  const paths = ['/node_modules/', '/node_modules/.package-lock.json', '/package.json'];
  const found: string[] = [];

  const checks = paths.map(async (path) => {
    try {
      const url = new URL(path, baseUrl).href;
      const res = await pinnedFetch(url, { method: 'HEAD', redirect: 'manual' });
      if (res.status === 200) found.push(url);
    } catch {
      /* skip */
    }
  });

  await Promise.all(checks);
  return found;
}

/* ── Main scan handler ──────────────────────────────────────────── */

export async function radarScanHandler(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json<{ url?: string }>().catch(() => ({ url: undefined }) as { url?: string });
  const rawUrl = body.url?.trim();
  if (!rawUrl) return c.json({ error: 'missing url' }, 400);

  let target: URL;
  try {
    const u = rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`;
    target = new URL(u);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }

  if (!URL_RE.test(target.href)) {
    return c.json({ error: 'only http/https urls are supported' }, 400);
  }

  const startTime = Date.now();
  const id = generateId();

  try {
    const [pageRes, dnsResult, ctSubs, robotsPaths, sitemapUrls] = await Promise.all([
      pinnedFetchFollow(target.href, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      }),
      dnsLookup(target.hostname),
      fetchSubdomainsViaCT(target.hostname),
      fetchRobotsTxt(target.hostname),
      fetchSitemapUrls(target.hostname),
    ]);

    const html = await pageRes.text();
    const headers: Record<string, string> = {};
    pageRes.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    const finalUrl = pageRes.url;

    const techs = detectTechnologies(html, headers);
    const jsFiles = extractJsFiles(html, target.href);
    const endpoints = extractEndpoints(html, target.href);
    const meta = extractMeta(html);
    const forms = extractForms(html);
    const images = extractImages(html);
    const links = extractLinks(html);
    const security = analyzeSecurityHeaders(headers);

    const emails = extractEmails(html);
    const guids = extractGuids(html);
    const localhostRefs = extractLocalhostRefs(html);
    const socialMediaUrls = extractSocialMediaUrls(html);
    const fileExtUrls = extractFileExtensionUrls(html);
    const parameters = extractParameters(html);
    const queryParameters = extractQueryParameters(html, target.href);
    const scannedUrls = links.map((l) => l.href).filter((h) => h.startsWith('http'));
    const domains = extractDomains(html, target.hostname);
    const ipAddresses = extractIps(html, dnsResult);
    const nodeModules = extractNodeModules(html);
    const graphql = extractGraphql(html, '');
    const vulns = extractVulnerabilities(html, headers, techs);
    const filteredPortUrls = extractFilteredPortUrls(html);

    // New mattew-inspired extractors
    const directoryListings = extractDirectoryListings(html, target.href);
    const backupFiles = extractBackupFiles(html, target.href);
    const debugEndpoints = extractDebugEndpoints(html, target.href);
    const openRedirects = extractOpenRedirects(html);
    const sensitiveFiles = extractSensitiveFiles(html);
    const sourceMaps = extractSourceMaps(html, target.href);
    const wafDetected = detectWaf(headers, html);
    const corsIssues = analyzeCors(headers);
    const cookieIssues = analyzeCookies(headers);
    const htmlComments = analyzeHtmlComments(html);
    const jwtTokens = detectJwts(html);

    // Parse robots.txt paths and sitemap URLs for additional endpoints
    const robotsDisallowPaths = robotsPaths.filter((p) => !p.startsWith('sitemap:'));
    const robotsSitemapRefs = robotsPaths.filter((p) => p.startsWith('sitemap:')).map((p) => p.replace('sitemap:', ''));
    const allSitemapUrls = [...new Set([...sitemapUrls, ...robotsSitemapRefs])];

    // Add robots.txt and sitemap URLs to scanned URLs
    for (const path of robotsDisallowPaths) {
      try {
        const fullUrl = new URL(path, target.href).href;
        if (!scannedUrls.includes(fullUrl)) scannedUrls.push(fullUrl);
      } catch {
        /* skip */
      }
    }
    for (const url of allSitemapUrls.slice(0, 50)) {
      if (!scannedUrls.includes(url)) scannedUrls.push(url);
    }

    // Add WAF to vulnerabilities
    if (wafDetected) {
      vulns.push({ type: 'WAF Detected', detail: `Web Application Firewall: ${wafDetected}`, severity: 'info' });
    }

    // Add CORS issues to vulnerabilities
    for (const issue of corsIssues) {
      vulns.push({ type: 'CORS Issue', detail: issue, severity: 'medium' });
    }

    // Add cookie issues to vulnerabilities
    for (const issue of cookieIssues) {
      vulns.push({ type: 'Cookie Issue', detail: issue, severity: 'medium' });
    }

    const [s3Assets, nodeModulesExposure] = await Promise.all([
      checkS3Buckets(target.hostname),
      checkNodeModulesExposure(target.href),
    ]);

    const allNodeModules = [...new Set([...nodeModules, ...nodeModulesExposure])];

    const apiPaths = extractApiPaths(html, '');

    const result: RadarScanResult = {
      id,
      target: target.href,
      scannedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      http: {
        status: pageRes.status,
        statusText: pageRes.statusText,
        headers,
        redirectChain: [],
        finalUrl,
        contentType: headers['content-type'] ?? '',
        server: headers['server'] ?? '',
        contentLength: parseInt(headers['content-length'] ?? '0', 10) || html.length,
      },
      dns: dnsResult,
      tls: null,
      technologies: techs,
      js_files: jsFiles,
      endpoints,
      meta,
      forms,
      images,
      links,
      security,
      emails,
      guids,
      localhost_refs: localhostRefs,
      social_media_urls: socialMediaUrls,
      file_extension_urls: fileExtUrls,
      parameters,
      query_parameters: queryParameters,
      scanned_urls: scannedUrls,
      api_paths: apiPaths,
      domains: [...new Set([...domains, ...ctSubs])],
      ip_addresses: ipAddresses,
      aws_assets: s3Assets,
      s3_takeovers: [],
      node_modules: allNodeModules,
      npm_confusion: [],
      vulnerabilities: vulns,
      graphql,
      filtered_port_urls: filteredPortUrls,
      directory_listings: directoryListings,
      backup_files: backupFiles,
      debug_endpoints: debugEndpoints,
      open_redirects: openRedirects,
      sensitive_files: sensitiveFiles,
      source_maps: sourceMaps,
      cors_issues: corsIssues,
      cookie_issues: cookieIssues,
      waf_detected: wafDetected ? [wafDetected] : [],
      jwt_tokens: jwtTokens,
      html_comments: htmlComments,
      hidden_forms: [],
      tech_hints: [],
      robots_disallow: robotsDisallowPaths,
      sitemap_urls: allSitemapUrls.slice(0, 50),
    };

    const cacheKey = `radar:${id}`;
    if (c.env.KV_CACHE) {
      await c.env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: RADAR_SCAN_TTL });
      // Populate the per-colo scan shadow so the page-load get in the same
      // colo is a Cache API hit, not a KV read.
      await writeRadarScanShadow(id, result);
      // Debounce the list RMW: a 30s window collapses burst scans of the
      // same target into a single list rewrite. KV has a hard 1 write/sec/key
      // limit, and back-to-back parallel scans of unrelated targets would
      // otherwise race on the read-modify-write of the shared list key.
      if (await shouldWriteLastGood('radar:runs', RADAR_LIST_DEBOUNCE_S)) {
        const listKey = 'radar:runs';
        const existing =
          (await c.env.KV_CACHE.get<Array<{ id: string; target: string; scannedAt: string; status: number }>>(
            listKey,
            'json'
          )) ?? [];
        existing.unshift({ id, target: target.href, scannedAt: result.scannedAt, status: pageRes.status });
        const trimmed = existing.slice(0, 100);
        await c.env.KV_CACHE.put(listKey, JSON.stringify(trimmed), { expirationTtl: RADAR_LIST_TTL });
        await writeRadarListShadow(trimmed);
      }
    }

    return c.json({ ...result, crawlId: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `scan failed: ${msg}` }, 502);
  }
}

export async function radarGetScanHandler(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id');
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    return c.json({ error: 'invalid scan id' }, 400);
  }
  if (!c.env.KV_CACHE) return c.json({ error: 'storage not configured' }, 503);
  // Per-colo shadow first — repeat reads in the same colo (SSR + client
  // hydration + retries) hit the Cache API instead of burning KV reads.
  const shadowed = await readRadarScanShadow(id);
  if (shadowed) return c.json(shadowed);
  const data = await c.env.KV_CACHE.get<RadarScanResult>(`radar:${id}`, 'json');
  if (!data) return c.json({ error: 'scan not found or expired' }, 404);
  await writeRadarScanShadow(id, data);
  return c.json(data);
}

export async function radarRecentHandler(c: Context<{ Bindings: Env }>) {
  if (!c.env.KV_CACHE) return c.json({ runs: [] });
  // Per-colo shadow — the recent-runs list is the same for every reader
  // in the colo, so caching it for the full KV TTL is safe.
  const shadowed = await readRadarListShadow();
  if (shadowed) return c.json({ runs: shadowed });
  const runs =
    (await c.env.KV_CACHE.get<Array<{ id: string; target: string; scannedAt: string; status: number }>>(
      'radar:runs',
      'json'
    )) ?? [];
  await writeRadarListShadow(runs);
  return c.json({ runs });
}
