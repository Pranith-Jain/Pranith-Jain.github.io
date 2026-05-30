import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { assertPublicHost } from '../lib/ssrf-guard';

// Browser UA — a bot/identifying UA gets 403/429'd by CDN/Cloudflare-fronted
// targets, which made previews fail on exactly the sites users paste most.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

interface UrlPreviewResponse {
  url: string;
  final_url: string;
  status: number;
  content_type?: string;
  title?: string;
  description?: string;
  og?: {
    title?: string;
    description?: string;
    image?: string;
    site_name?: string;
    type?: string;
  };
  twitter?: {
    title?: string;
    description?: string;
    image?: string;
    card?: string;
  };
  canonical?: string;
  lang?: string;
  charset?: string;
  favicon?: string;
  feeds?: { title?: string; url: string; type: string }[];
  meta?: {
    author?: string;
    generator?: string;
    robots?: string;
    keywords?: string;
    theme_color?: string;
    viewport?: string;
  };
  urlscan?: {
    result: string;
    screenshot?: string;
    scanned_at?: string;
    page?: { ip?: string; server?: string; country?: string; domain?: string };
  };
  bytes_read: number;
  redirect_blocked?: { location: string };
}

/**
 * Enrich with the most recent EXISTING urlscan.io scan for this URL (or its
 * domain). Uses the free search API — no scan submission, so it's instant
 * and doesn't make the queried site public on our behalf. Best-effort:
 * never blocks or fails the preview if urlscan is slow/unavailable.
 */
async function fetchUrlscan(finalUrl: string, env: Env): Promise<UrlPreviewResponse['urlscan'] | undefined> {
  let host = '';
  try {
    host = new URL(finalUrl).hostname;
  } catch {
    return undefined;
  }
  const q = `page.url:"${finalUrl.replace(/"/g, '\\"')}" OR page.domain:${host}`;
  const api = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=20`;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (env.URLSCAN_API_KEY) headers['API-Key'] = env.URLSCAN_API_KEY;
    const res = await fetch(api, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      results?: Array<{
        _id?: string;
        screenshot?: string;
        task?: { time?: string };
        page?: { ip?: string; server?: string; country?: string; domain?: string };
      }>;
    };
    const results = json.results ?? [];
    if (results.length === 0) return undefined;
    // Newest scan first.
    results.sort((a, b) => (b.task?.time ?? '').localeCompare(a.task?.time ?? ''));
    const top = results[0];
    if (!top?._id) return undefined;
    return {
      result: `https://urlscan.io/result/${top._id}/`,
      screenshot: top.screenshot ?? `https://urlscan.io/screenshots/${top._id}.png`,
      scanned_at: top.task?.time,
      page: top.page
        ? {
            ip: top.page.ip,
            server: top.page.server,
            country: top.page.country,
            domain: top.page.domain,
          }
        : undefined,
    };
  } catch {
    return undefined;
  }
}

// Raw HTML attribute/text values carry entities (&amp; &#39; &#x27;) and
// arbitrary internal whitespace/newlines (the archived reddit <title> is
// literally "reddit: what's new \nonline"). A metadata preview must show
// the human string, not the source bytes. Decode the common entity set,
// then collapse whitespace. Output is rendered as a React text node
// (auto-escaped), so decoding here introduces no injection risk.
// Curated set of the named entities that actually show up in titles,
// descriptions and feed names (raquo/hellip/mdash/smart-quotes/symbols).
// Not the full HTML5 table — numeric refs cover the long tail.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  minus: '−',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  middot: '·',
  bull: '•',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  micro: 'µ',
  para: '¶',
  sect: '§',
  dagger: '†',
  Dagger: '‡',
  prime: '′',
  Prime: '″',
  trade: '™',
  copy: '©',
  reg: '®',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  curren: '¤',
  brvbar: '¦',
  iexcl: '¡',
  iquest: '¿',
  ordf: 'ª',
  ordm: 'º',
  not: '¬',
  shy: '­',
  macr: '¯',
  acute: '´',
  cedil: '¸',
  uml: '¨',
  szlig: 'ß',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        try {
          return String.fromCodePoint(cp);
        } catch {
          return whole;
        }
      }
      return whole;
    }
    // Entities are case-sensitive (&Dagger; != &dagger;); try exact first,
    // then a lowercase fallback for legacy uppercase aliases (&AMP;).
    return NAMED_ENTITIES[code] ?? NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function cleanText(s: string | undefined): string | undefined {
  if (s == null) return undefined;
  const out = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return out.length > 0 ? out : undefined;
}

function metaContent(html: string, name: string): string | undefined {
  // Match <meta name/property="X" content="Y"> or <meta content="Y" name/property="X">
  // Use [^>]* to handle any attribute order; capture content value (allows ' inside "" and vice versa)
  const dq = `"([^"]*)"`;
  const sq = `'([^']*)'`;
  const anyQuote = `(?:${dq}|${sq})`;

  const patterns = [
    // name/property first, then content
    new RegExp(`<meta\\s[^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*${anyQuote}`, 'i'),
    // content first, then name/property
    new RegExp(`<meta\\s[^>]*content\\s*=\\s*${anyQuote}[^>]*(?:name|property)\\s*=\\s*["']${name}["']`, 'i'),
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m) return cleanText(m[1] ?? m[2] ?? m[3] ?? m[4]);
  }
  return undefined;
}

function titleOf(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return cleanText(m?.[1]);
}

function tagAttr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const v = m ? (m[2] ?? m[3] ?? m[4]) : undefined;
  return v != null ? decodeEntities(v).trim() || undefined : undefined;
}

function absUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

interface ParsedLink {
  rel?: string;
  type?: string;
  href?: string;
  title?: string;
}

function parseLinks(html: string): ParsedLink[] {
  return (html.match(/<link\b[^>]*>/gi) ?? []).map((tag) => ({
    rel: tagAttr(tag, 'rel')?.toLowerCase(),
    type: tagAttr(tag, 'type')?.toLowerCase(),
    href: tagAttr(tag, 'href'),
    title: tagAttr(tag, 'title'),
  }));
}

function canonicalOf(html: string): string | undefined {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  // URLs shouldn't contain raw whitespace; decode entities (&amp; in query
  // strings is common) and trim, but don't collapse internal spaces.
  const v = m?.[1];
  return v ? decodeEntities(v).trim() || undefined : undefined;
}

function langOf(html: string): string | undefined {
  const m = html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);
  return cleanText(m?.[1]);
}

function charsetOf(html: string): string | undefined {
  const direct = html.match(/<meta[^>]*\bcharset\s*=\s*["']?([\w-]+)/i);
  if (direct?.[1]) return direct[1].toLowerCase();
  const httpEquiv = html.match(/<meta[^>]*content\s*=\s*["'][^"']*charset=([\w-]+)/i);
  return httpEquiv?.[1]?.toLowerCase();
}

function faviconOf(links: ParsedLink[], base: string): string | undefined {
  // Prefer a standard icon; fall back to apple-touch-icon; finally /favicon.ico.
  const icon =
    links.find((l) => l.rel === 'icon' || l.rel === 'shortcut icon') ?? links.find((l) => l.rel?.includes('icon'));
  return absUrl(icon?.href, base) ?? absUrl('/favicon.ico', base);
}

function feedsOf(links: ParsedLink[], base: string): { title?: string; url: string; type: string }[] {
  const out: { title?: string; url: string; type: string }[] = [];
  for (const l of links) {
    if (l.rel !== 'alternate' || !l.type) continue;
    if (!l.type.includes('rss+xml') && !l.type.includes('atom+xml')) continue;
    const url = absUrl(l.href, base);
    if (!url) continue;
    out.push({ title: cleanText(l.title), url, type: l.type });
  }
  return out;
}

export async function urlPreviewHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('url');
  if (!raw) return c.json({ error: 'missing url' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'unsupported protocol' }, 400);
  }

  // Resolve A + AAAA and refuse any private/reserved answer (complete
  // range list, shared guard). pinIp is used below to pin the connection
  // so `fetch` cannot re-resolve to a rebound internal IP.
  const hostCheck = await assertPublicHost(parsed.hostname);
  if (!hostCheck.ok) {
    return c.json(
      { error: hostCheck.error ?? 'blocked', blocked_ip: hostCheck.blockedIp },
      (hostCheck.status ?? 403) as 400 | 403 | 502
    );
  }

  // Kick off the urlscan.io lookup now so it runs concurrently with the
  // main page fetch + body read — it adds no latency to the critical path.
  const urlscanPromise = fetchUrlscan(parsed.toString(), c.env as Env);

  // Follow redirects safely — each hop re-validates the target hostname via
  // assertPublicHost so a 302 to a private/cloud-metadata IP is rejected.
  let currentUrl = parsed.toString();
  let finalRes: Response | null = null;
  let finalHostCheck = hostCheck;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop > 0) {
      try {
        const nextHost = new URL(currentUrl).hostname;
        finalHostCheck = await assertPublicHost(nextHost);
      } catch {
        return c.json({ error: 'redirect_target_invalid', url: parsed.toString(), final_url: currentUrl }, 502, {
          'Cache-Control': 'no-store',
        });
      }
      if (!finalHostCheck.ok) {
        return c.json<UrlPreviewResponse>(
          {
            url: parsed.toString(),
            final_url: currentUrl,
            status: 0,
            bytes_read: 0,
            redirect_blocked: { location: currentUrl },
          },
          200,
          { 'Cache-Control': 'public, max-age=300' }
        );
      }
    }

    try {
      finalRes = await fetch(currentUrl, {
        headers: { 'user-agent': UA, accept: 'text/html,*/*' },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cf: { resolveOverride: finalHostCheck.pinIp },
      } as RequestInit);
    } catch (err) {
      return c.json({ error: safeErrorMessage(c.env as never, err) }, 502, { 'Cache-Control': 'no-store' });
    }

    // Surface upstream rate-limit so the client can back off rather than
    // get a generic 502. Pass through the upstream Retry-After if given.
    if (finalRes.status === 429) {
      const retryAfter = finalRes.headers.get('retry-after') ?? '60';
      return c.json({ error: 'upstream_rate_limited', upstream: parsed.hostname, upstream_status: 429 }, 429, {
        'retry-after': retryAfter,
        'cache-control': 'no-store',
      });
    }

    if (finalRes.status >= 300 && finalRes.status < 400) {
      const location = finalRes.headers.get('location');
      if (!location) break;
      try {
        const next = new URL(location, currentUrl);
        if (next.protocol !== 'http:' && next.protocol !== 'https:') break;
        currentUrl = next.toString();
      } catch {
        break; // invalid redirect target URL
      }
      continue;
    }

    break; // non-redirect response — final
  }

  // Exceeded redirect budget or loop ended on a redirect with no location
  if (!finalRes || (finalRes.status >= 300 && finalRes.status < 400)) {
    return c.json<UrlPreviewResponse>(
      {
        url: parsed.toString(),
        final_url: currentUrl,
        status: finalRes?.status ?? 0,
        bytes_read: 0,
        redirect_blocked: { location: currentUrl },
      },
      200,
      { 'Cache-Control': 'public, max-age=300' }
    );
  }

  // Read the final response body
  const reader = finalRes.body?.getReader();
  let bytesRead = 0;
  let chunks = '';
  if (reader) {
    const decoder = new TextDecoder('utf-8');
    while (bytesRead < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        bytesRead += value.byteLength;
        chunks += decoder.decode(value, { stream: true });
      }
    }
    void reader.cancel();
  }

  const ct = finalRes.headers.get('content-type') ?? undefined;
  const isHtml = !!ct && ct.toLowerCase().includes('html');

  const body: UrlPreviewResponse = {
    url: parsed.toString(),
    final_url: currentUrl,
    status: finalRes.status,
    content_type: ct,
    bytes_read: bytesRead,
  };

  if (isHtml && chunks) {
    body.title = titleOf(chunks);
    body.description = metaContent(chunks, 'description');
    body.og = {
      title: metaContent(chunks, 'og:title'),
      description: metaContent(chunks, 'og:description'),
      image: metaContent(chunks, 'og:image'),
      site_name: metaContent(chunks, 'og:site_name'),
      type: metaContent(chunks, 'og:type'),
    };
    body.twitter = {
      title: metaContent(chunks, 'twitter:title'),
      description: metaContent(chunks, 'twitter:description'),
      image: metaContent(chunks, 'twitter:image'),
      card: metaContent(chunks, 'twitter:card'),
    };
    body.canonical = canonicalOf(chunks);

    const base = currentUrl;
    const links = parseLinks(chunks);
    body.lang = langOf(chunks);
    body.charset = charsetOf(chunks);
    body.favicon = faviconOf(links, base);
    const feeds = feedsOf(links, base);
    if (feeds.length > 0) body.feeds = feeds;

    const meta = {
      author: metaContent(chunks, 'author'),
      generator: metaContent(chunks, 'generator'),
      robots: metaContent(chunks, 'robots'),
      keywords: metaContent(chunks, 'keywords'),
      theme_color: metaContent(chunks, 'theme-color'),
      viewport: metaContent(chunks, 'viewport'),
    };
    if (Object.values(meta).some(Boolean)) body.meta = meta;
  }

  const urlscan = await urlscanPromise;
  if (urlscan) body.urlscan = urlscan;

  return c.json(body, 200, { 'Cache-Control': 'public, max-age=600, s-maxage=1800' });
}
