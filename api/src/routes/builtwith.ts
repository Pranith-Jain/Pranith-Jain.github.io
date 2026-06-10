import type { Context } from 'hono';
import type { Env } from '../env';
import { pinnedFetchFollow, SsrfError } from '../lib/ssrf-guard';

// ==============================
// BuiltWith Technology Stack Lookup
// ==============================

/**
 * Technology-stack detection for a domain.
 *
 * There is NO free BuiltWith JSON API (the public `rank/lookup.json` endpoint
 * needs a paid Domain-API key — passing a plan name like `platinum` 404s), so
 * by default this route runs a free, self-contained heuristic: it fetches the
 * target over HTTPS (following redirects, short timeout, browser-like UA) and
 * fingerprints technologies from (a) the response HTTP headers and (b) HTML
 * body signatures.
 *
 * If a real `BUILTWITH_API_KEY` secret is configured we still fall through to
 * the heuristic — the paid API integration is left as a documented hook but is
 * intentionally not the default so the tool never silently returns empty.
 *
 * The response shape stays compatible with the previous handler: it keeps
 * `domain`, `source`, `timestamp`, `categorized_products`, and `categories`,
 * and exposes the detected stack as a flat `technologies` list (plus the legacy
 * `products` alias) so the agent tool / frontend keep working.
 *
 * @see https://builtwith.com/
 */

const FETCH_TIMEOUT_MS = 10000;
// A normal desktop UA — some stacks (Cloudflare, Shopify, WAFs) serve a
// stripped or blocked response to obvious bot User-Agents.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

type TechCategory =
  | 'web_server'
  | 'cms'
  | 'frontend_framework'
  | 'backend_runtime'
  | 'backend_framework'
  | 'backend_language'
  | 'hosting_cloud'
  | 'cdn'
  | 'ecommerce'
  | 'analytics'
  | 'tag_manager'
  | 'monitoring'
  | 'security'
  | 'css_framework'
  | 'javascript_library'
  | 'other';

interface DetectedTech {
  name: string;
  category: TechCategory;
  /** Where the signal came from, e.g. "header:server" or "html:wp-content". */
  evidence: string;
  /** Rough confidence 0-100 (header matches are stronger than body matches). */
  confidence: number;
}

/** A single fingerprint rule against either a header value or the HTML body. */
interface Signature {
  name: string;
  category: TechCategory;
  /** Pattern matched (case-insensitively) against the search text. */
  pattern: RegExp;
  confidence: number;
}

// ---- Header-based signatures --------------------------------------------
// Each rule is tested against `"<header-name>: <header-value>"` so a pattern
// can key on the header name, its value, or both.
const HEADER_SIGNATURES: Signature[] = [
  { name: 'Nginx', category: 'web_server', pattern: /^server:\s*nginx/i, confidence: 95 },
  { name: 'Apache', category: 'web_server', pattern: /^server:\s*apache/i, confidence: 95 },
  { name: 'Microsoft IIS', category: 'web_server', pattern: /^server:\s*microsoft-iis/i, confidence: 95 },
  { name: 'LiteSpeed', category: 'web_server', pattern: /^server:\s*litespeed/i, confidence: 95 },
  { name: 'Caddy', category: 'web_server', pattern: /^server:\s*caddy/i, confidence: 95 },
  { name: 'OpenResty', category: 'web_server', pattern: /^server:\s*openresty/i, confidence: 90 },
  { name: 'Cloudflare', category: 'cdn', pattern: /^server:\s*cloudflare/i, confidence: 95 },
  { name: 'Cloudflare', category: 'cdn', pattern: /^cf-ray:/i, confidence: 95 },
  { name: 'Cloudflare', category: 'cdn', pattern: /^cf-cache-status:/i, confidence: 90 },
  { name: 'Vercel', category: 'hosting_cloud', pattern: /^(server|x-vercel-id):\s*vercel|^x-vercel-/i, confidence: 95 },
  { name: 'Netlify', category: 'hosting_cloud', pattern: /^(server:\s*netlify|x-nf-request-id:)/i, confidence: 95 },
  {
    name: 'GitHub Pages',
    category: 'hosting_cloud',
    pattern: /^server:\s*github\.com|^x-github-request-id:/i,
    confidence: 90,
  },
  {
    name: 'Amazon CloudFront',
    category: 'cdn',
    pattern: /^(server:\s*cloudfront|x-amz-cf-id:|via:.*cloudfront)/i,
    confidence: 90,
  },
  { name: 'Amazon S3', category: 'hosting_cloud', pattern: /^server:\s*amazons3/i, confidence: 90 },
  {
    name: 'Amazon Web Services',
    category: 'hosting_cloud',
    pattern: /^(x-amz-request-id:|x-amz-id-2:)/i,
    confidence: 80,
  },
  {
    name: 'Fastly',
    category: 'cdn',
    pattern: /^(x-served-by:.*fastly|x-fastly-request-id:|via:.*fastly)/i,
    confidence: 85,
  },
  { name: 'Akamai', category: 'cdn', pattern: /^(x-akamai-transformed:|server:\s*akamaighost)/i, confidence: 90 },
  { name: 'Varnish', category: 'cdn', pattern: /^(via:.*varnish|x-varnish:)/i, confidence: 80 },
  {
    name: 'Google Cloud',
    category: 'hosting_cloud',
    pattern: /^(server:\s*gws|server:\s*esf|via:.*google)/i,
    confidence: 75,
  },
  {
    name: 'Shopify',
    category: 'ecommerce',
    pattern: /^(powered-by:\s*shopify|x-shopify-stage:|x-shopid:|x-shardid:|x-sorting-hat-)/i,
    confidence: 95,
  },
  { name: 'PHP', category: 'backend_language', pattern: /^x-powered-by:.*php/i, confidence: 90 },
  {
    name: 'ASP.NET',
    category: 'backend_framework',
    pattern: /^(x-powered-by:.*asp\.net|x-aspnet-version:|x-aspnetmvc-version:)/i,
    confidence: 90,
  },
  { name: 'Express', category: 'backend_framework', pattern: /^x-powered-by:.*express/i, confidence: 90 },
  { name: 'Next.js', category: 'frontend_framework', pattern: /^x-powered-by:.*next\.js|^x-nextjs-/i, confidence: 90 },
  {
    name: 'Ruby on Rails',
    category: 'backend_framework',
    pattern: /^x-powered-by:.*phusion|^server:.*passenger/i,
    confidence: 70,
  },
  { name: 'WordPress', category: 'cms', pattern: /^link:.*\/wp-json\/|^link:.*api\.w\.org/i, confidence: 90 },
  { name: 'Drupal', category: 'cms', pattern: /^x-generator:\s*drupal/i, confidence: 95 },
  { name: 'WordPress', category: 'cms', pattern: /^x-generator:\s*wordpress/i, confidence: 95 },
  {
    name: 'WP Engine',
    category: 'hosting_cloud',
    pattern: /^(x-powered-by:.*wp\s*engine|server:.*wpengine)/i,
    confidence: 85,
  },
  { name: 'Sucuri', category: 'security', pattern: /^(server:\s*sucuri|x-sucuri-id:)/i, confidence: 90 },
  { name: 'Imperva / Incapsula', category: 'security', pattern: /^(x-iinfo:|x-cdn:\s*incapsula)/i, confidence: 85 },
  { name: 'HSTS', category: 'security', pattern: /^strict-transport-security:/i, confidence: 60 },
];

// ---- Set-Cookie name signatures -----------------------------------------
// Tested against each individual Set-Cookie value.
const COOKIE_SIGNATURES: Signature[] = [
  { name: 'WordPress', category: 'cms', pattern: /\bwordpress_(logged_in|sec|test_cookie)?/i, confidence: 80 },
  { name: 'WooCommerce', category: 'ecommerce', pattern: /\b(woocommerce_|wp_woocommerce_session)/i, confidence: 80 },
  { name: 'Laravel', category: 'backend_framework', pattern: /\blaravel_session\b/i, confidence: 85 },
  { name: 'PHP', category: 'backend_language', pattern: /\bPHPSESSID\b/i, confidence: 75 },
  { name: 'ASP.NET', category: 'backend_framework', pattern: /\bASP\.NET_SessionId\b/i, confidence: 85 },
  { name: 'Java', category: 'backend_language', pattern: /\bJSESSIONID\b/i, confidence: 75 },
  {
    name: 'Django',
    category: 'backend_framework',
    pattern: /\b(csrftoken|django_language|sessionid)\b/i,
    confidence: 55,
  },
  { name: 'Shopify', category: 'ecommerce', pattern: /\b_shopify_(y|s|sa_p|sa_t|essential)\b/i, confidence: 90 },
  { name: 'Ruby on Rails', category: 'backend_framework', pattern: /\b_session_id\b/i, confidence: 50 },
];

// ---- HTML body signatures -----------------------------------------------
const BODY_SIGNATURES: Signature[] = [
  { name: 'WordPress', category: 'cms', pattern: /\/wp-content\/|\/wp-includes\/|\/wp-json\//i, confidence: 90 },
  {
    name: 'Drupal',
    category: 'cms',
    pattern: /drupal-settings-json|\/sites\/(all|default)\/(themes|modules)\//i,
    confidence: 90,
  },
  {
    name: 'Joomla',
    category: 'cms',
    pattern: /\/media\/jui\/|joomla-script-options|\/components\/com_/i,
    confidence: 85,
  },
  { name: 'Ghost', category: 'cms', pattern: /content="Ghost\b|\/ghost\/assets\//i, confidence: 85 },
  { name: 'Wix', category: 'cms', pattern: /static\.wixstatic\.com|wix-warmup-data/i, confidence: 90 },
  {
    name: 'Squarespace',
    category: 'cms',
    pattern: /static\.squarespace\.com|squarespace\.com\/universal/i,
    confidence: 90,
  },
  { name: 'Webflow', category: 'cms', pattern: /\.webflow\.io|data-wf-(page|site)/i, confidence: 85 },
  {
    name: 'Shopify',
    category: 'ecommerce',
    pattern: /Shopify\.theme|cdn\.shopify\.com|\bmyshopify\.com\b|\/cdn\/shop\//i,
    confidence: 90,
  },
  {
    name: 'WooCommerce',
    category: 'ecommerce',
    pattern: /\/wp-content\/plugins\/woocommerce\/|woocommerce-/i,
    confidence: 85,
  },
  {
    name: 'Magento',
    category: 'ecommerce',
    pattern: /\/static\/version\d+\/frontend\/|Magento_|mage\/cookies/i,
    confidence: 85,
  },
  { name: 'BigCommerce', category: 'ecommerce', pattern: /cdn\d*\.bigcommerce\.com|stencil-utils/i, confidence: 85 },
  {
    name: 'Next.js',
    category: 'frontend_framework',
    pattern: /\/_next\/(static|data)\/|__NEXT_DATA__/i,
    confidence: 90,
  },
  { name: 'Nuxt.js', category: 'frontend_framework', pattern: /\/_nuxt\/|__NUXT__|window\.__NUXT__/i, confidence: 90 },
  { name: 'Gatsby', category: 'frontend_framework', pattern: /\/page-data\/|id="___gatsby"|gatsby-/i, confidence: 85 },
  {
    name: 'SvelteKit',
    category: 'frontend_framework',
    pattern: /\/_app\/immutable\/|data-sveltekit-/i,
    confidence: 85,
  },
  { name: 'Astro', category: 'frontend_framework', pattern: /astro-island|data-astro-/i, confidence: 80 },
  {
    name: 'React',
    category: 'frontend_framework',
    pattern: /data-reactroot|data-reactid|__REACT_DEVTOOLS_GLOBAL_HOOK__/i,
    confidence: 70,
  },
  {
    name: 'Vue.js',
    category: 'frontend_framework',
    pattern: /data-v-[0-9a-f]{8}|__VUE__|vue(\.min)?\.js/i,
    confidence: 70,
  },
  { name: 'Angular', category: 'frontend_framework', pattern: /ng-version=|_ngcontent-|ng-app=/i, confidence: 75 },
  {
    name: 'jQuery',
    category: 'javascript_library',
    pattern: /jquery(?:-|\.)[0-9]|\/jquery(\.min)?\.js/i,
    confidence: 70,
  },
  {
    name: 'Bootstrap',
    category: 'css_framework',
    pattern: /bootstrap(\.min)?\.(css|js)|class="[^"]*\b(container|row|col-(?:xs|sm|md|lg))\b/i,
    confidence: 60,
  },
  {
    name: 'Tailwind CSS',
    category: 'css_framework',
    pattern: /tailwind|class="[^"]*\b(?:flex|grid|text-(?:sm|lg|xl)|bg-(?:gray|white|black))-?/i,
    confidence: 50,
  },
  {
    name: 'Font Awesome',
    category: 'javascript_library',
    pattern: /font-?awesome|fa-(solid|regular|brands)\b|\bfas\b fa-/i,
    confidence: 60,
  },
  {
    name: 'Google Analytics',
    category: 'analytics',
    pattern: /google-analytics\.com\/(ga|analytics)\.js|gtag\(\s*['"]config['"]\s*,\s*['"]G-|_gaq\.push/i,
    confidence: 85,
  },
  {
    name: 'Google Tag Manager',
    category: 'tag_manager',
    pattern: /googletagmanager\.com\/(gtm|gtag)/i,
    confidence: 90,
  },
  {
    name: 'Facebook Pixel',
    category: 'analytics',
    pattern: /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init['"]/i,
    confidence: 85,
  },
  { name: 'Hotjar', category: 'analytics', pattern: /static\.hotjar\.com|hjid:/i, confidence: 85 },
  { name: 'Segment', category: 'analytics', pattern: /cdn\.segment\.com\/analytics\.js/i, confidence: 85 },
  { name: 'HubSpot', category: 'analytics', pattern: /js\.hs-scripts\.com|js\.hubspot\.com/i, confidence: 85 },
  { name: 'Cloudflare', category: 'cdn', pattern: /cdn-cgi\/|cloudflareinsights\.com/i, confidence: 75 },
  { name: 'reCAPTCHA', category: 'security', pattern: /www\.google\.com\/recaptcha\/|grecaptcha/i, confidence: 80 },
  { name: 'hCaptcha', category: 'security', pattern: /hcaptcha\.com\/|h-captcha/i, confidence: 80 },
];

/** Detect technologies from raw HTTP response headers + the HTML body. */
function detectTechnologies(headers: Headers, body: string): DetectedTech[] {
  const detected = new Map<string, DetectedTech>();

  const add = (sig: Signature, evidence: string): void => {
    const key = `${sig.name}::${sig.category}`;
    const existing = detected.get(key);
    if (!existing || sig.confidence > existing.confidence) {
      detected.set(key, {
        name: sig.name,
        category: sig.category,
        evidence,
        confidence: sig.confidence,
      });
    }
  };

  // Build a flat "name: value" line per header for the header rules.
  const headerLines: string[] = [];
  const cookieValues: string[] = [];
  headers.forEach((value, name) => {
    headerLines.push(`${name}: ${value}`);
    if (name.toLowerCase() === 'set-cookie') {
      // Headers#forEach folds multiple Set-Cookie into one comma-joined
      // value in the Workers runtime; split defensively so each cookie name
      // is matched independently.
      for (const part of value.split(/,(?=[^;]+?=)/)) cookieValues.push(part);
    }
  });

  for (const line of headerLines) {
    for (const sig of HEADER_SIGNATURES) {
      if (sig.pattern.test(line)) {
        const headerName = line.slice(0, Math.max(0, line.indexOf(':'))).toLowerCase();
        add(sig, `header:${headerName || 'response'}`);
      }
    }
  }

  for (const cookie of cookieValues) {
    for (const sig of COOKIE_SIGNATURES) {
      if (sig.pattern.test(cookie)) add(sig, 'cookie');
    }
  }

  if (body) {
    for (const sig of BODY_SIGNATURES) {
      if (sig.pattern.test(body)) add(sig, `html:${sig.name.toLowerCase()}`);
    }
  }

  return Array.from(detected.values()).sort((a, b) => b.confidence - a.confidence);
}

export async function builtwithHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = (c.req.query('domain') ?? '').trim().toLowerCase();
  if (!domain) return c.json({ error: 'missing domain parameter' }, 400);

  // Validate domain format
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(domain)) {
    return c.json({ error: 'invalid domain format' }, 400);
  }

  try {
    const targetUrl = `https://${domain}/`;
    // SSRF guard: a user-supplied domain can resolve to (or 302 to) an internal /
    // metadata / RFC1918 host. pinnedFetchFollow validates every hop against the
    // private-range blocklist, pins the connection to the validated public IP
    // (defeats DNS rebinding), and re-checks each redirect — never raw
    // fetch(..., { redirect: 'follow' }) on an attacker-controlled host. (No `cf`
    // cache here: pinnedFetch* sets resolveOverride; caching is at the response layer.)
    const res = await pinnedFetchFollow(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
      { maxRedirects: 3 }
    );

    // Read at most ~512KB of HTML — enough for every signature, bounded so a
    // huge page can't blow the Worker memory/time budget.
    let body = '';
    try {
      const raw = await res.text();
      body = raw.length > 512 * 1024 ? raw.slice(0, 512 * 1024) : raw;
    } catch {
      body = '';
    }

    const technologies = detectTechnologies(res.headers, body);

    // Group detected tech by category (legacy `categorized_products` shape).
    const categorizedProducts: Record<string, string[]> = {};
    for (const t of technologies) {
      const bucket = categorizedProducts[t.category] ?? (categorizedProducts[t.category] = []);
      if (!bucket.includes(t.name)) bucket.push(t.name);
    }

    // Legacy `products` alias so older consumers keep working.
    const products = technologies.map((t) => ({
      name: t.name,
      version: '',
      similarity: t.confidence,
      description: t.evidence,
      category: t.category,
    }));

    return c.json(
      {
        domain,
        source: c.env.BUILTWITH_API_KEY ? 'builtwith-heuristic+key-available' : 'heuristic',
        method: 'http-fingerprint',
        timestamp: new Date().toISOString(),
        final_url: res.url || targetUrl,
        http_status: res.status,
        technologies,
        products,
        categorized_products: categorizedProducts,
        categories: Object.keys(categorizedProducts),
        total_technologies: technologies.length,
      },
      200,
      { 'Cache-Control': 'public, max-age=3600' }
    );
  } catch (err) {
    // SSRF guard rejected the host (private/reserved/metadata, or a redirect to
    // one). Fail closed with a generic 400 — don't echo the blocked IP/internal
    // detail back to the caller (no SSRF oracle).
    if (err instanceof SsrfError) {
      return c.json({ error: 'domain resolves to a disallowed host', domain }, 400, { 'Cache-Control': 'no-store' });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    // A fetch failure (DNS, TLS, timeout) means we genuinely couldn't reach the
    // host — surface it rather than pretending we found nothing.
    return c.json(
      {
        error: 'BuiltWith lookup failed',
        message,
        domain,
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
