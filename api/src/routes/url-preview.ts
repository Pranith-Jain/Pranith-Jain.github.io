import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { assertPublicHost } from '../lib/ssrf-guard';

const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir-preview/1.0; +https://pranithjain.qzz.io)';
const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 8000;

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
  bytes_read: number;
  redirect_blocked?: { location: string };
}

// Raw HTML attribute/text values carry entities (&amp; &#39; &#x27;) and
// arbitrary internal whitespace/newlines (the archived reddit <title> is
// literally "reddit: what's new \nonline"). A metadata preview must show
// the human string, not the source bytes. Decode the common entity set,
// then collapse whitespace. Output is rendered as a React text node
// (auto-escaped), so decoding here introduces no injection risk.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
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
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
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

function canonicalOf(html: string): string | undefined {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  // URLs shouldn't contain raw whitespace; decode entities (&amp; in query
  // strings is common) and trim, but don't collapse internal spaces.
  const v = m?.[1];
  return v ? decodeEntities(v).trim() || undefined : undefined;
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

  try {
    const res = await fetch(parsed.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { resolveOverride: hostCheck.pinIp },
    } as RequestInit);

    // Surface upstream rate-limit so the client can back off rather than
    // get a generic 502. Pass through the upstream Retry-After if given.
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after') ?? '60';
      return c.json({ error: 'upstream_rate_limited', upstream: parsed.hostname, upstream_status: 429 }, 429, {
        'retry-after': retryAfter,
        'cache-control': 'no-store',
      });
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '';
      return c.json<UrlPreviewResponse>(
        {
          url: parsed.toString(),
          final_url: parsed.toString(),
          status: res.status,
          bytes_read: 0,
          redirect_blocked: { location },
        },
        200,
        { 'Cache-Control': 'public, max-age=300' }
      );
    }

    const reader = res.body?.getReader();
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

    const ct = res.headers.get('content-type') ?? undefined;
    const isHtml = !!ct && ct.toLowerCase().includes('html');

    const body: UrlPreviewResponse = {
      url: parsed.toString(),
      final_url: parsed.toString(),
      status: res.status,
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
    }

    return c.json(body, 200, { 'Cache-Control': 'public, max-age=600, s-maxage=1800' });
  } catch (err) {
    return c.json({ error: safeErrorMessage(c.env as never, err) }, 502, { 'Cache-Control': 'no-store' });
  }
}
