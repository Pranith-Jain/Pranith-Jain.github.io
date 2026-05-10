import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Aggregated cybersec Telegram firehose.
 *
 * Telegram exposes a server-rendered preview of any public channel at
 * `https://t.me/s/<handle>`. The HTML contains the latest ~20 messages
 * with timestamps, permalinks, view counts, and text — no auth, no
 * Bot API, no MTProto. This is what tg-rss services scrape internally.
 *
 * We hand-pick the channels (high signal, stable handles, public-by-design)
 * rather than letting the user point us at arbitrary handles — that
 * keeps us out of the abuse-vector business and bounds subrequest cost.
 *
 * Cost shape: each preview HTML is ~30–130 KB. With CHANNELS.length
 * fetches at CONCURRENCY parallelism, we issue N subrequests in 4 round-trips.
 * Cached 30 min — Telegram channels post at human cadence, polling more
 * often is wasteful and risks rate-limiting from Telegram's edge.
 */

const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL = 30 * 60; // 30 minutes
const CONCURRENCY = 4;
/** Per-channel cap. Channel HTML returns ~20 messages — keep latest 8. */
const MAX_MESSAGES_PER_CHANNEL = 8;
/** Truncate per-message text. Long posts (full IR write-ups) are still followable via permalink. */
const MAX_TEXT_LEN = 800;

interface ChannelSpec {
  handle: string;
  /** Display name shown in the UI. */
  name: string;
  /** What this channel covers — surfaces as a tooltip. */
  blurb: string;
  /** Pill-colour hint so the panel can colour-code by topic. */
  topic: 'malware' | 'ransomware' | 'hacktivism' | 'osint' | 'news' | 'leaks';
}

/**
 * Curated channel set. Each handle is liveness-probed before inclusion —
 * we only ship channels that (a) expose t.me/s/<handle> previews and
 * (b) have posted within the last ~30 days. Last verified 2026-05-11.
 *
 * Channels we used to carry but had to drop because they went silent or
 * disabled previews (kept here as a "do not re-add without re-checking"
 * audit trail): malware_traffic (Oct'25), CyberKnow20 (Oct'23),
 * FalconFeedsio (May'24), bellingcat (Jan'24), ransomwatch (no preview),
 * DDoSecrets / IntelCrab / osintfounder / cisa_alerts / krebsonsecurity
 * (preview disabled or channel removed).
 */
const CHANNELS: ChannelSpec[] = [
  // Malware research
  {
    handle: 'vxunderground',
    name: 'vx-underground',
    blurb: 'Malware-source archive + threat-actor commentary',
    topic: 'malware',
  },
  {
    handle: 'androidmalware',
    name: 'Android Malware',
    blurb: 'Daily Android-malware sample drops + analysis',
    topic: 'malware',
  },
  // Threat intel / CTI feeds
  { handle: 'secharvester', name: 'SecHarvester', blurb: 'High-volume threat-intel firehose', topic: 'leaks' },
  { handle: 'group_ib', name: 'Group-IB', blurb: 'Official Group-IB threat-intel channel', topic: 'osint' },
  { handle: 'ctinow', name: 'CTI Now', blurb: 'Real-time CTI aggregator — IOCs, advisories, leaks', topic: 'osint' },
  {
    handle: 'Cyber_Ti_Reports_VN',
    name: 'Cyber TI Reports',
    blurb: 'Curated CTI report digest (multi-language)',
    topic: 'osint',
  },
  // Breach / leak feeds
  { handle: 'dataleak', name: 'DataLeak', blurb: 'Data-breach repost channel', topic: 'leaks' },
  // News mirrors
  { handle: 'BleepingComputer', name: 'BleepingComputer', blurb: 'Breaking incident news', topic: 'news' },
  { handle: 'TheHackerNews', name: 'The Hacker News', blurb: 'Security news headlines', topic: 'news' },
  {
    handle: 'cyber_security_channel',
    name: 'Cyber Security Channel',
    blurb: 'High-volume security-news aggregator',
    topic: 'news',
  },
  // Bug-bounty / offensive research
  {
    handle: 'dailybountywriteup',
    name: 'Daily Bounty Writeup',
    blurb: 'Curated bug-bounty write-ups + disclosed vuln reports',
    topic: 'osint',
  },
];

interface ParsedMessage {
  permalink: string;
  datetime: string;
  views?: string;
  text: string;
}

export interface TelegramFeedItem {
  channel_handle: string;
  channel_name: string;
  channel_topic: ChannelSpec['topic'];
  channel_blurb: string;
  permalink: string;
  /** ISO 8601 from Telegram's <time datetime>. */
  datetime: string;
  /** Truncated, plain-text. Permalink for full content + media. */
  text: string;
  /** Telegram's display string (e.g. "3.6K", "12K"). Optional. */
  views?: string;
}

export interface TelegramFeedResponse {
  generated_at: string;
  channels: { handle: string; name: string; topic: string; ok: boolean; count: number }[];
  items: TelegramFeedItem[];
  warnings: string[];
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      // Telegram's preview view sometimes 302s if no Accept header is set.
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)',
      },
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const text = await r.text();
    // A 200 with the channel-not-found body is still a "miss" — Telegram serves
    // the homepage HTML instead of a 404 in some cases. Detect by absence of
    // the message-wrapper marker.
    if (!text.includes('tgme_widget_message_wrap')) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decode the tiny subset of HTML entities that appear in Telegram message
 * text. Telegram only emits these five via their preview renderer.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s: string): string {
  // Convert <br> to newline so we don't run lines together.
  const withBreaks = s.replace(/<br\s*\/?>/gi, '\n');
  // Drop everything else.
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, '')).trim();
}

function parseChannelHtml(html: string): ParsedMessage[] {
  // Split on the wrapper boundary — each block is one message.
  // Use a sentinel to mark boundaries, then split, since JS regex lacks lookbehind in older engines.
  const SENTINEL = 'TGMSG';
  const marked = html.replace(
    /<div class="tgme_widget_message_wrap/g,
    SENTINEL + '<div class="tgme_widget_message_wrap'
  );
  const blocks = marked.split(SENTINEL).slice(1);

  const out: ParsedMessage[] = [];
  for (const block of blocks) {
    const permalink = /<a class="tgme_widget_message_date"[^>]*href="([^"]+)"/.exec(block)?.[1];
    const datetime = /datetime="([^"]+)"/.exec(block)?.[1];
    const views = /tgme_widget_message_views"[^>]*>([^<]+)/.exec(block)?.[1]?.trim();
    const textBlock =
      /<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>(?=\s*<div|\s*<\/div>\s*<div class="tgme_widget_message_footer)/.exec(
        block
      )?.[1];
    if (!permalink || !datetime) continue;
    let text = textBlock ? stripHtml(textBlock) : '';
    if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN - 1) + '…';
    out.push({ permalink, datetime, views, text });
  }
  // Telegram renders oldest-first; keep the newest tail.
  return out.slice(-MAX_MESSAGES_PER_CHANNEL).reverse();
}

/**
 * Pure-data fetcher exposed for /api/v1/snapshot. Returns the full payload
 * (no Response wrapping) so the snapshot handler can compose it directly
 * without a worker-internal HTTP call (which Cloudflare 522s on same-worker).
 */
export async function fetchTelegramFeed(): Promise<TelegramFeedResponse> {
  const warnings: string[] = [];
  const channelStatus: TelegramFeedResponse['channels'] = [];
  const allItems: TelegramFeedItem[] = [];

  // Bounded fan-out so we don't overwhelm Telegram's edge.
  const queue = [...CHANNELS];
  async function worker() {
    while (queue.length > 0) {
      const ch = queue.shift();
      if (!ch) return;
      const html = await fetchHtml(`https://t.me/s/${encodeURIComponent(ch.handle)}`);
      if (!html) {
        warnings.push(`could not fetch t.me/s/${ch.handle}`);
        channelStatus.push({ handle: ch.handle, name: ch.name, topic: ch.topic, ok: false, count: 0 });
        continue;
      }
      const messages = parseChannelHtml(html);
      channelStatus.push({ handle: ch.handle, name: ch.name, topic: ch.topic, ok: true, count: messages.length });
      for (const m of messages) {
        if (!m.text) continue;
        allItems.push({
          channel_handle: ch.handle,
          channel_name: ch.name,
          channel_topic: ch.topic,
          channel_blurb: ch.blurb,
          permalink: m.permalink,
          datetime: m.datetime,
          text: m.text,
          views: m.views,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  allItems.sort((a, b) => b.datetime.localeCompare(a.datetime));

  return {
    generated_at: new Date().toISOString(),
    channels: channelStatus.sort((a, b) => a.name.localeCompare(b.name)),
    items: allItems,
    warnings,
  };
}

export async function telegramFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  // v3: 2026-05-11 audit — dropped 4 stale handles (CyberKnow20, FalconFeedsio,
  // bellingcat, malware_traffic), added 5 active ones (ctinow, Cyber_Ti_Reports_VN,
  // dailybountywriteup, cyber_security_channel, androidmalware).
  // Bump on response-shape changes or curated-channel-list changes.
  const cacheKey = new Request('https://telegram-feed-cache.internal/v3');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const body = await fetchTelegramFeed();
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
