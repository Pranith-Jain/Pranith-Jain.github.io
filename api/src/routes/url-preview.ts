import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';
import { resolveRecord } from '../lib/dns';

const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir-preview/1.0; +https://pranithjain.qzz.io)';
const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 8000;

// IPv4 private + reserved + multicast + broadcast.
const PRIVATE_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/;

/**
 * Returns true if the given normalized IPv6 string falls in a range we
 * never want the Worker to fetch through. Covers:
 *   - ::1                    loopback
 *   - ::                     unspecified
 *   - ::ffff:<ipv4>          IPv4-mapped (must defer to PRIVATE_IPV4)
 *   - fe80::/10              link-local
 *   - fc00::/7               unique local (fc.. + fd..)
 *   - ff00::/8               multicast
 *   - 2001:db8::/32          documentation
 *   - 64:ff9b::/96           well-known NAT64 (could be any IPv4)
 * The match is intentionally string-prefix based: cloudflare-dns returns
 * fully-expanded addresses for AAAA queries (e.g. fe80:0000:...).
 */
function isPrivateIpv6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === '::1' || a === '::') return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d). Reapply the IPv4 check.
  const v4mapped = /^::ffff:([0-9.]+)$/i.exec(a);
  if (v4mapped && v4mapped[1] && PRIVATE_IPV4.test(v4mapped[1])) return true;
  // Compress "0000" runs in case the resolver returned uncompressed form.
  const expanded = a
    .split(':')
    .map((p) => p.replace(/^0+/, '') || '0')
    .join(':');
  // Take the first hex group.
  const head = expanded.split(':')[0] ?? '';
  if (head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) return true; // fe80::/10
  if (head.startsWith('fc') || head.startsWith('fd')) return true; // fc00::/7
  if (head.startsWith('ff')) return true; // multicast
  if (head === '2001' && expanded.split(':')[1] === 'db8') return true; // documentation
  if (head === '64' && expanded.split(':')[1] === 'ff9b') return true; // NAT64 — anything inside maps to a real IPv4
  return false;
}

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

  // Resolve hostname to BOTH IPv4 and IPv6 — refuse if any answer is in a
  // private / reserved / loopback / multicast / link-local range. Skipping
  // AAAA lets a hostile rebind ("fe80::1" via DNS) bypass the IPv4-only
  // check on a worker host with IPv6 outbound enabled.
  const [aRecord, aaaaRecord] = await Promise.all([
    resolveRecord(parsed.hostname, 'A'),
    resolveRecord(parsed.hostname, 'AAAA'),
  ]);
  if (aRecord.error && aaaaRecord.error) {
    return c.json({ error: `dns lookup failed: ${aRecord.error}` }, 502);
  }
  const allRecords = [...aRecord.records, ...aaaaRecord.records];
  if (allRecords.length === 0) {
    return c.json({ error: 'host does not resolve' }, 400);
  }
  const blockedV4 = aRecord.records.find((ip) => PRIVATE_IPV4.test(ip));
  const blockedV6 = aaaaRecord.records.find((ip) => isPrivateIpv6(ip));
  if (blockedV4 || blockedV6) {
    return c.json(
      {
        error: 'host resolves to a private/reserved IP — refusing to fetch',
        blocked_ip: blockedV4 ?? blockedV6,
      },
      403
    );
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

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
