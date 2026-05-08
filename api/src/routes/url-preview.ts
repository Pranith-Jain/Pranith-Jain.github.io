import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { resolveRecord } from '../lib/dns';

const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir-preview/1.0; +https://pranithjain.qzz.io)';
const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 8000;

const PRIVATE_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/;

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
    if (m) return m[1] ?? m[2] ?? m[3] ?? m[4];
  }
  return undefined;
}

function titleOf(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.trim();
}

function canonicalOf(html: string): string | undefined {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  return m?.[1];
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

  // Resolve hostname to IP — refuse private ranges
  const aRecord = await resolveRecord(parsed.hostname, 'A');
  if (aRecord.error) {
    return c.json({ error: `dns lookup failed: ${aRecord.error}` }, 502);
  }
  if (aRecord.records.length === 0) {
    return c.json({ error: 'host does not resolve' }, 400);
  }
  const blocked = aRecord.records.some((ip) => PRIVATE_IPV4.test(ip));
  if (blocked) {
    return c.json({ error: 'host resolves to a private/reserved IP — refusing to fetch' }, 403);
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

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
      const decoder = new TextDecoder('utf-8', { fatal: false });
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
