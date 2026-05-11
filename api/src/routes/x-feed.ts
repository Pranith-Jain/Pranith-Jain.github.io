import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Cybersec social-media firehose at /api/v1/x-feed.
 *
 * Endpoint kept named 'x-feed' for compatibility with the existing
 * /threatintel/x route. Implementation pivoted 2026-05-11 — Nitter
 * mirrors all block Cloudflare's egress IPs as scrapers, so the prior
 * attempt to pull X via Nitter returned 0 of 12 handles consistently.
 *
 * Many of the same cybersec researchers + vendor accounts have moved
 * to Bluesky and Mastodon (infosec.exchange) since X killed the free
 * read API in 2023. Both expose proper, keyless RSS — Bluesky at
 * bsky.app/profile/<handle>/rss and Mastodon at
 * <instance>/@<handle>.rss.
 *
 * The handle set is HAND-PROBED — each was verified 200 OK with actual
 * content (not the 404-shell that Bluesky returns for unknown profiles).
 */

const FETCH_TIMEOUT_MS = 9_000;
const CACHE_TTL = 60 * 60;
const CONCURRENCY = 4;
const MAX_POSTS_PER_HANDLE = 6;
const MAX_TEXT_LEN = 400;

type Platform = 'bluesky' | 'mastodon';

interface HandleSpec {
  platform: Platform;
  /** Full handle as the platform writes it (bsky.app domain, mastodon @user). */
  handle: string;
  /** Display name. */
  name: string;
  blurb: string;
  topic: 'research' | 'news' | 'vendor' | 'gov' | 'malware';
}

/**
 * Curated cybersec accounts on Bluesky + Mastodon (infosec.exchange).
 * All verified live 2026-05-11.
 */
const HANDLES: HandleSpec[] = [
  // Bluesky — cybersec researchers + vendor labs
  {
    platform: 'bluesky',
    handle: 'malwaretech.com',
    name: 'Marcus Hutchins',
    blurb: 'WannaCry kill-switch — malware research',
    topic: 'research',
  },
  {
    platform: 'bluesky',
    handle: 'thedfirreport.bsky.social',
    name: 'The DFIR Report',
    blurb: 'Real intrusion case-studies',
    topic: 'research',
  },
  {
    platform: 'bluesky',
    handle: 'talosintelligence.com',
    name: 'Cisco Talos',
    blurb: 'Cisco Talos threat research',
    topic: 'vendor',
  },
  {
    platform: 'bluesky',
    handle: 'mandiant.com',
    name: 'Mandiant',
    blurb: 'Mandiant / Google Cloud threat research',
    topic: 'vendor',
  },
  {
    platform: 'bluesky',
    handle: 'huntress.com',
    name: 'Huntress',
    blurb: 'Huntress threat lab + IR write-ups',
    topic: 'vendor',
  },
  {
    platform: 'bluesky',
    handle: 'sentinelone.com',
    name: 'SentinelOne',
    blurb: 'SentinelLabs malware + APT research',
    topic: 'vendor',
  },
  {
    platform: 'bluesky',
    handle: 'vxunderground.bsky.social',
    name: 'vx-underground',
    blurb: 'Malware-source archive announcements',
    topic: 'research',
  },
  {
    platform: 'bluesky',
    handle: 'swiftonsecurity.bsky.social',
    name: 'SwiftOnSecurity',
    blurb: 'Security tradecraft + commentary',
    topic: 'research',
  },

  // Mastodon — infosec.exchange (the de-facto cybersec instance)
  {
    platform: 'mastodon',
    handle: 'briankrebs',
    name: 'Brian Krebs',
    blurb: 'KrebsOnSecurity author — breach reporting',
    topic: 'news',
  },
  {
    platform: 'mastodon',
    handle: 'GossiTheDog',
    name: 'Kevin Beaumont',
    blurb: 'Live exploitation tracking — DoublePulsar',
    topic: 'research',
  },
  {
    platform: 'mastodon',
    handle: 'campuscodi',
    name: 'Catalin Cimpanu',
    blurb: 'Risky Biz News — daily cyber news',
    topic: 'news',
  },
  {
    platform: 'mastodon',
    handle: 'malwaretech',
    name: 'Marcus Hutchins (Mastodon)',
    blurb: 'Marcus on Mastodon — same content',
    topic: 'research',
  },
  {
    platform: 'mastodon',
    handle: 'cyb3rops',
    name: 'Florian Roth',
    blurb: 'Signature-base / YARA author — Sigma maintainer',
    topic: 'research',
  },
  {
    platform: 'mastodon',
    handle: 'mttaggart',
    name: 'Matt Taggart',
    blurb: 'Detection engineering + threat hunting',
    topic: 'research',
  },
  {
    platform: 'mastodon',
    handle: 'x0rz',
    name: '@x0rz',
    blurb: 'IOC drops + threat-actor commentary',
    topic: 'research',
  },
  {
    platform: 'mastodon',
    handle: 'vxunderground',
    name: 'vx-underground (Mastodon)',
    blurb: 'Sample drops + research commentary',
    topic: 'research',
  },
];

export interface XFeedItem {
  handle: string;
  handle_name: string;
  handle_topic: HandleSpec['topic'];
  handle_blurb: string;
  platform: Platform;
  text: string;
  link: string;
  pub_date: string;
}

export interface XFeedResponse {
  generated_at: string;
  handles: {
    handle: string;
    name: string;
    platform: Platform;
    topic: HandleSpec['topic'];
    ok: boolean;
    count: number;
  }[];
  items: XFeedItem[];
  warnings: string[];
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(s: string): string {
  return (
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Common numeric escapes Mastodon emits
      .replace(/&#xA;/g, '\n')
  );
}

function stripHtml(s: string): string {
  // Mastodon's RSS double-encodes HTML inside <description> (so `<p>foo</p>`
  // comes through as `&lt;p&gt;foo&lt;/p&gt;`). Decoding entities FIRST
  // gives us real tags that the regex passes can then strip; otherwise the
  // user sees literal "<p>foo</p>" in the rendered text.
  const decoded = decodeEntities(s);
  return decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Both Bluesky + Mastodon use RSS 2.0 with <item>. Parsing is shared. */
function parseRssItems(xml: string): Array<{ title: string; description: string; link: string; pub_date: string }> {
  const out: Array<{ title: string; description: string; link: string; pub_date: string }> = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '';
    const description = /<description[^>]*>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? '';
    const link = /<link[^>]*>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? '';
    const pub = /<pubDate[^>]*>([^<]+)<\/pubDate>/.exec(block)?.[1] ?? '';
    if (!link) continue;
    out.push({
      title: decodeEntities(stripCdata(title)).trim(),
      description: stripHtml(stripCdata(description)),
      link: link.trim(),
      pub_date: pub.trim(),
    });
  }
  return out;
}

function rssUrl(spec: HandleSpec): string {
  if (spec.platform === 'bluesky') return `https://bsky.app/profile/${encodeURIComponent(spec.handle)}/rss`;
  return `https://infosec.exchange/@${encodeURIComponent(spec.handle)}.rss`;
}

async function fetchHandle(spec: HandleSpec): Promise<{ ok: boolean; items: XFeedItem[] }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(rssUrl(spec), {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)',
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5',
      },
      redirect: 'follow',
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, items: [] };
    const body = await r.text();
    if (!body.includes('<rss') && !body.includes('<channel>')) return { ok: false, items: [] };
    const parsed = parseRssItems(body).slice(0, MAX_POSTS_PER_HANDLE);
    const items: XFeedItem[] = parsed
      .filter((p) => p.link)
      .map((p) => ({
        handle: spec.handle,
        handle_name: spec.name,
        handle_topic: spec.topic,
        handle_blurb: spec.blurb,
        platform: spec.platform,
        // Bluesky lacks <title>, only <description>. Mastodon has the post
        // text in <description>. Prefer description; fall back to title.
        text: (p.description || p.title || '').slice(0, MAX_TEXT_LEN),
        link: p.link,
        pub_date: p.pub_date,
      }));
    return { ok: items.length > 0, items };
  } catch {
    clearTimeout(timer);
    return { ok: false, items: [] };
  }
}

export async function fetchXFeed(): Promise<XFeedResponse> {
  const warnings: string[] = [];
  const handleStatus: XFeedResponse['handles'] = [];
  const allItems: XFeedItem[] = [];

  const queue = [...HANDLES];
  async function worker() {
    while (queue.length > 0) {
      const spec = queue.shift();
      if (!spec) return;
      const r = await fetchHandle(spec);
      if (!r.ok) warnings.push(`no posts for ${spec.platform}:${spec.handle}`);
      handleStatus.push({
        handle: spec.handle,
        name: spec.name,
        platform: spec.platform,
        topic: spec.topic,
        ok: r.ok,
        count: r.items.length,
      });
      allItems.push(...r.items);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Newest-first across all handles. Bluesky pubDate is RFC-822-ish ("11 May
  // 2026 00:56 +0000"); Mastodon is RFC-3339. Date.parse handles both.
  allItems.sort((a, b) => Date.parse(b.pub_date) - Date.parse(a.pub_date));

  return {
    generated_at: new Date().toISOString(),
    handles: handleStatus.sort((a, b) => a.name.localeCompare(b.name)),
    items: allItems,
    warnings,
  };
}

export const X_FEED_CACHE_KEY = 'https://x-feed-cache.internal/v4-social-decode';

export async function xFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(X_FEED_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const body = await fetchXFeed();
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
