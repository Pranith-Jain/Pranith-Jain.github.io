import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import { safeNullLog } from '../lib/safe-catch';

const CUSTOM_CHANNELS_KV_KEY = 'tg:custom-channels:v1';

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
const CACHE_TTL = 75 * 60; // 75 min — over the hourly cron interval so every-other
// tick avoids re-fetching all 34+ Telegram channels and preserves subrequest
// budget for x-claims, x-feed, and reddit feed pre-warps in the same cron.
const CONCURRENCY = 8;
/** Per-channel cap. Channel HTML preview surfaces ~20 messages — keep the
 *  full preview window. Combined with the 7d cutoff below, this lifts the
 *  page from ~176 messages → up to ~440 across 22 channels with newer
 *  ones bubbling to the top naturally. */
// Per-channel cap. Bumped 20 → 50 alongside the cross-platform "show
// last 500 items OR 7 days" upgrade. Telegram's t.me/s/ preview view
// surfaces ~30-50 most-recent messages — 50 captures the realistic
// upstream ceiling without an extra paginated fetch.
const MAX_MESSAGES_PER_CHANNEL = 50;
/** Drop messages older than this many days. Telegram channels post at
 *  human cadence; anything older than a week is stale by the standards
 *  of a "today's intel" surface. */
// Was 7 — too tight for channels like CyberSecurityPulse / phishingradar /
// group_ib which post a few times a week. 7-day window produced "0"
// counts that read as broken when the channel was actually fine, just
// not chatty enough. 30 days surfaces a full month's signal.
const MAX_MESSAGE_AGE_DAYS = 30;
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
 * (b) have posted within the last ~30 days. Last verified 2026-05-12.
 *
 * Channels we used to carry but had to drop because they went silent or
 * disabled previews (kept here as a "do not re-add without re-checking"
 * audit trail): malware_traffic (Oct'25), CyberKnow20 (Oct'23),
 * FalconFeedsio (May'24), bellingcat (Jan'24), ransomwatch (no preview),
 * DDoSecrets / IntelCrab / osintfounder / cisa_alerts / krebsonsecurity
 * (preview disabled or channel removed).
 *
 * 2026-05-12 probe round (~50 handles tested) skipped because of preview
 * disabled / channel removed / stale (>30d): cve_notify, dailycve, cves,
 * CVEnew, cve_alerts, 0daytoday, 0day_today, exploit_dev, CyberNewsfeed
 * (Dec'24), cyberonews, feed_threatintel, GossiTheDog, secblog,
 * cybersecurity_alerts, cyberalerts, threatintelligence (Mar'26, just
 * past 30d), osint_lite, osintessentials (Dec'23), osintbase (Nov'22),
 * osinternational, osint_resources, osint_dose, osinttv (recent but
 * only 4 msgs in a month), osint_unlimited, dataleak_news, leaksbase,
 * databreaches_news, breach_alerts, breachalerts, hackleak, dataleakers,
 * dataleaknet, scam_alerts, scam_radar, scamalert, antiscam, cyberscams,
 * scamcheckers (Oct'22), fraud_alerts, antifraud_uk, pwn3d_labs,
 * cvepost, secalert (Dec'23), cveofficial, cvedaily, cve_news, vulninfo,
 * cyber_security_official (2022), Pwn3d, DailyDarkWeb, cybernewsoffl,
 * darkwebnews (Feb'25), soc_radar, lookcyber, threatpost, SocRadar,
 * cybernewslive, infostealer_leaks, stealer_logs (May'24), darkfeed_io,
 * leakedsource, breachednews, dataleak_alert, leaks_news, databreachtoday.
 *
 * Carding-specific channels were INTENTIONALLY skipped. Public carding
 * channels on Telegram are almost exclusively vendor channels promoting
 * stolen-card sales, not defensive research. Surfacing them on a security
 * portfolio site would carry legal and ethical risk. Phishing / scam
 * warning channels (phishingradar below) are the closest defensive proxy.
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
  {
    handle: 'defendor_eng',
    name: 'Defendor (EN)',
    blurb: 'Defensive-CTI / IR write-ups + threat-actor tracking',
    topic: 'osint',
  },
  {
    handle: 'cyberosintosint',
    name: 'Cyber OSINT',
    blurb: 'OSINT-style cyber-news firehose',
    topic: 'osint',
  },
  {
    handle: 'CTIUpdates',
    name: 'CTI Updates',
    blurb: 'Real-time CTI feed — IOCs, threat reports, advisories',
    topic: 'osint',
  },
  // CVE / vulnerability disclosure channels (verified 2026-05-12: each has
  // 40+ recent posts and a sub-day publish cadence). Classed as 'osint'
  // because they're disclosure intelligence rather than breaking news.
  { handle: 'cve0day', name: 'CVE 0day', blurb: 'CVE / 0day disclosure firehose', topic: 'osint' },
  { handle: 'cvenotify', name: 'CVE Notify', blurb: 'High-cadence CVE alerts (NVD-style)', topic: 'osint' },
  {
    handle: 'cvefeed',
    name: 'CVE & Vulnerability RSS',
    blurb: 'CVE / vulnerability RSS aggregator',
    topic: 'osint',
  },
  // Vendor-backed CTI news (Telefónica Tech). Daily volume, English-language.
  {
    handle: 'CyberSecurityPulse',
    name: 'CyberSecurityPulse',
    blurb: 'Telefónica Tech daily CTI pulse — incidents, advisories, research',
    topic: 'news',
  },
  // Phishing / scam warnings. German-language but covers global brands.
  {
    handle: 'phishingradar',
    name: 'Phishing Radar',
    blurb: 'Phishing + scam warnings (DE) — brand-impersonation alerts',
    topic: 'news',
  },
  // Spanish-language multi-source CTI firehose. Posts "🚨 ALERTA CVE 🚨"
  // and "🚨🚨 ALERTA RANSOMWARE 🚨🚨" templates with structured fields
  // (Víctima / Grupo / País / Web / Descripción). Verified 2026-05-12: 40
  // recent posts, today's last activity. Same publisher backs a broader
  // CTI dashboard (leaks / darknet / negotiations / malware samples).
  {
    handle: 'mythreatintel',
    name: 'My Threat Intel',
    blurb: 'Spanish CTI firehose — CVE + ransomware-victim alerts',
    topic: 'osint',
  },
  // Breach / leak / ransomware feeds — both replacements verified live
  // 2026-05-23 (20 posts each in t.me/s/ preview):
  //   - `dataleak`   was a low-quality repost channel (mixed signal, drama).
  //   - `leakradar_io` went dead (0 posts in the preview view).
  // FalconFeeds and RansomLook are defensive-CTI publishers with stable
  // posting cadence and structured fields (victim / group / dates).
  {
    handle: 'falconfeedsio',
    name: 'FalconFeeds.io',
    blurb: 'Official FalconFeeds — ransomware victim tracker + breach announcements',
    topic: 'leaks',
  },
  {
    handle: 'RansomLook',
    name: 'RansomLook',
    blurb: 'Ransomware operator tracker — group claims, victims, leak-site activity',
    topic: 'leaks',
  },
  // News mirrors
  { handle: 'BleepingComputer', name: 'BleepingComputer', blurb: 'Breaking incident news', topic: 'news' },
  { handle: 'TheHackerNews', name: 'The Hacker News', blurb: 'Security news headlines', topic: 'news' },
  {
    handle: 'cyber_security_channel',
    name: 'Cyber Security Channel',
    blurb: 'High-volume security-news aggregator',
    topic: 'news',
  },
  { handle: 'cyberscoop', name: 'CyberScoop', blurb: 'CyberScoop news + government-cyber coverage', topic: 'news' },
  // Bug-bounty / offensive research
  {
    handle: 'dailybountywriteup',
    name: 'Daily Bounty Writeup',
    blurb: 'Curated bug-bounty write-ups + disclosed vuln reports',
    topic: 'osint',
  },
  // Intelligence digests
  {
    handle: 'IntCyberDigest',
    name: 'IntCyberDigest',
    blurb: 'Cyber intelligence digest — threat actor analysis, campaign tracking, and CTI round-ups',
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

export interface ChannelQuality {
  /** 0-100. Combined score; higher = healthier signal-to-noise. */
  score: number;
  /** What we used to compute the score — exposed so the UI can show the math. */
  signals: {
    /** Share of messages within the last 30d. Stale channels drag this down. */
    recent_pct: number;
    /** Share of messages whose text duplicates another in the same window. */
    dupe_pct: number;
    /** Median text length across messages — proxy for content depth. */
    median_text_len: number;
    /** Posts per day across the message window (rolling, days-since-oldest basis). */
    posts_per_day: number;
  };
}

export interface TelegramFeedResponse {
  generated_at: string;
  channels: {
    handle: string;
    name: string;
    topic: string;
    ok: boolean;
    count: number;
    quality?: ChannelQuality;
  }[];
  items: TelegramFeedItem[];
  warnings: string[];
}

export async function fetchHtml(url: string): Promise<string | null> {
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

export function parseChannelHtml(html: string): ParsedMessage[] {
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
    const textBlock = /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1];
    if (!permalink || !datetime) continue;
    let text = textBlock ? stripHtml(textBlock) : '';
    if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN - 1) + '…';
    out.push({ permalink, datetime, views, text });
  }
  // Telegram renders oldest-first. Filter to the last MAX_MESSAGE_AGE_DAYS
  // window, then keep the newest MAX_MESSAGES_PER_CHANNEL — newest first.
  const cutoff = Date.now() - MAX_MESSAGE_AGE_DAYS * 86_400_000;
  const fresh = out.filter((m) => {
    const t = Date.parse(m.datetime);
    return Number.isFinite(t) && t >= cutoff;
  });
  // If a channel went silent for >7d we still want SOMETHING surfaced;
  // fall back to the latest few raw messages so the channel isn't dropped
  // entirely from the panel.
  const pool = fresh.length > 0 ? fresh : out;
  return pool.slice(-MAX_MESSAGES_PER_CHANNEL).reverse();
}

/**
 * Compute a 0-100 quality score for a channel from its recent messages.
 *
 * The four signals:
 *   - recent_pct  → fraction posted in last 30d (dead channels drop sharply)
 *   - dupe_pct    → fraction of msgs whose text matches another (spam/repost)
 *   - median_len  → content depth proxy; <50 chars is "title-only" noise
 *   - posts/day   → cadence sanity; both <0.05 and >25 are penalized
 *
 * Each signal feeds a sub-score in [0,1]; we average them and scale to 100.
 * The intent is decision-support — a channel scoring 35 should be sorted
 * below one scoring 80, but we don't drop it from the firehose entirely.
 */
function scoreChannel(messages: ParsedMessage[]): ChannelQuality {
  if (messages.length === 0) {
    return {
      score: 0,
      signals: { recent_pct: 0, dupe_pct: 0, median_text_len: 0, posts_per_day: 0 },
    };
  }

  const now = Date.now();
  const recentMs = 30 * 24 * 3600 * 1000;
  let recent = 0;
  const lengths: number[] = [];
  const normalized = new Map<string, number>();
  const timestamps: number[] = [];

  for (const m of messages) {
    const t = Date.parse(m.datetime);
    if (Number.isFinite(t)) {
      timestamps.push(t);
      if (now - t <= recentMs) recent += 1;
    }
    const len = (m.text ?? '').length;
    lengths.push(len);
    const key = (m.text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (key) normalized.set(key, (normalized.get(key) ?? 0) + 1);
  }

  const recentPct = recent / messages.length;

  // Dupes: any text appearing >1× contributes (count - 1) to dupe count.
  let dupes = 0;
  for (const c of normalized.values()) if (c > 1) dupes += c - 1;
  const dupePct = dupes / messages.length;

  lengths.sort((a, b) => a - b);
  const medianLen = lengths[Math.floor(lengths.length / 2)] ?? 0;

  // posts/day across the message window: oldest→newest delta.
  let postsPerDay = 0;
  if (timestamps.length >= 2) {
    timestamps.sort((a, b) => a - b);
    const spanDays = Math.max(0.5, (timestamps[timestamps.length - 1]! - timestamps[0]!) / (24 * 3600 * 1000));
    postsPerDay = messages.length / spanDays;
  }

  // Sub-scores
  const sRecent = recentPct;
  const sDupe = 1 - Math.min(1, dupePct * 2); // penalize duplicates aggressively
  const sLen = Math.min(1, medianLen / 200); // 200 chars ≈ a good post body
  // Cadence: ideal 0.3 → 15 posts/day. Below 0.05 = dead; above 25 = firehose.
  let sCadence: number;
  if (postsPerDay <= 0.05) sCadence = 0;
  else if (postsPerDay >= 25) sCadence = 0.3;
  else if (postsPerDay < 0.3) sCadence = postsPerDay / 0.3;
  else if (postsPerDay <= 15) sCadence = 1;
  else sCadence = 1 - (postsPerDay - 15) / 10; // taper 15 → 25

  const score = Math.round(((sRecent + sDupe + sLen + sCadence) / 4) * 100);

  return {
    score,
    signals: {
      recent_pct: Math.round(recentPct * 100),
      dupe_pct: Math.round(dupePct * 100),
      median_text_len: medianLen,
      posts_per_day: Math.round(postsPerDay * 10) / 10,
    },
  };
}

/**
 * Pure-data fetcher exposed for /api/v1/snapshot. Returns the full payload
 * (no Response wrapping) so the snapshot handler can compose it directly
 * without a worker-internal HTTP call (which Cloudflare 522s on same-worker).
 */
export async function fetchTelegramFeed(kv?: KVNamespace): Promise<TelegramFeedResponse> {
  const warnings: string[] = [];
  const channelStatus: TelegramFeedResponse['channels'] = [];
  const allItems: TelegramFeedItem[] = [];

  // Merge hardcoded channels with user-added custom channels from KV
  const customChannels: ChannelSpec[] = [];
  if (kv) {
    try {
      const raw = await kv.get(CUSTOM_CHANNELS_KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ handle: string; name: string }>;
        for (const ch of parsed) {
          customChannels.push({
            handle: ch.handle,
            name: ch.name,
            blurb: `User-added channel: ${ch.handle}`,
            topic: 'osint',
          });
        }
      }
    } catch {
      /* KV unavailable, skip custom channels */
    }
  }

  const queue = [...CHANNELS, ...customChannels];
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
      const quality = scoreChannel(messages);
      let textCount = 0;
      for (const m of messages) {
        if (!m.text) continue;
        textCount += 1;
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
      channelStatus.push({
        handle: ch.handle,
        name: ch.name,
        topic: ch.topic,
        ok: true,
        count: textCount,
        quality,
      });
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

/** Exported so /api/v1/snapshot can read the same cached payload directly. */
// Bumped v8 → v9 alongside MAX_MESSAGES_PER_CHANNEL 8→20 and the 7d filter
// so the next request abandons any cached payload built under the old caps.
export const TELEGRAM_FEED_CACHE_KEY = 'https://telegram-feed-cache.internal/v10-7d-50pc';

// Bump value is read on every TG feed visit to invalidate the cache
// when custom channels change. Shadow it in caches.default with a 60s
// TTL so the KV read happens at most once/min/colo instead of per-visit.
const BUMP_SHADOW_CACHE_KEY = new Request('https://tg-bump-shadow.internal/v1');
const BUMP_SHADOW_TTL = 60;

export async function readBumpValue(env: Env): Promise<string | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    const shadow = await cache.match(BUMP_SHADOW_CACHE_KEY);
    if (shadow) {
      const v = await shadow.text();
      return v || null;
    }
  } catch {
    /* fall through to KV */
  }
  const fresh = env.KV_CACHE ? await safeNullLog('kv-get-tg-bump', env.KV_CACHE.get('tg:custom-channels:bump')) : null;
  // Always write a shadow — even "no bump" cached as empty string saves
  // the same read next time. Empty marker is treated as absent on read.
  try {
    await cache.put(
      BUMP_SHADOW_CACHE_KEY,
      new Response(fresh ?? '', { headers: { 'cache-control': `max-age=${BUMP_SHADOW_TTL}` } })
    );
  } catch {
    /* swallow */
  }
  return fresh;
}

export async function getTelegramFeedCacheKey(env: Env): Promise<Request> {
  const bump = await readBumpValue(env);
  return new Request(`${TELEGRAM_FEED_CACHE_KEY}${bump ? `-${bump}` : ''}`);
}

export async function telegramFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = await getTelegramFeedCacheKey(c.env);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchTelegramFeed(c.env.KV_CACHE);
  // Serialize once and build TWO independent Response objects — one to
  // return to the client, two to cache. Cloning the returned response
  // in `waitUntil` was failing (the cloned stream got canceled by the
  // client's read or by the runtime's per-invocation cleanup), which
  // left the cache empty and forced the next request to rebuild from
  // scratch. Two independent Responses eliminates the dependency.
  const json = JSON.stringify(body);
  const cacheHeaders = {
    'content-type': 'application/json',
    'cache-control': `public, max-age=${CACHE_TTL}`,
  };
  const cacheResponseBump = new Response(json, { headers: cacheHeaders });
  const cacheResponseBase = new Response(json, { headers: cacheHeaders });
  const clientResponse = new Response(json, { status: 200, headers: cacheHeaders });
  c.executionCtx.waitUntil(
    (async () => {
      try {
        await cache.put(cacheKey, cacheResponseBump);
      } catch {
        /* swallow */
      }
      try {
        await cache.put(new Request(TELEGRAM_FEED_CACHE_KEY), cacheResponseBase);
      } catch {
        /* swallow */
      }
    })()
  );
  return clientResponse;
}

// ─── Custom channels (user-added) ────────────────────────────────────────────

interface CustomChannelEntry {
  handle: string;
  name: string;
  added_at: string;
}

export async function telegramCustomChannelsGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ channels: [], error: 'KV not configured' });
  try {
    const raw = await kv.get(CUSTOM_CHANNELS_KV_KEY);
    const channels: CustomChannelEntry[] = raw ? JSON.parse(raw) : [];
    return c.json({ channels }, 200, { 'cache-control': 'no-store' });
  } catch {
    return c.json({ channels: [], error: 'failed to read custom channels' }, 500);
  }
}

export async function telegramCustomChannelsPostHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not configured' }, 500);

  const body = (await c.req.json()) as { handle?: string; name?: string };
  const handle = body.handle?.trim().replace(/^@/, '') ?? '';
  const name = (body.name?.trim() || handle) ?? '';

  if (!handle || !/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(handle)) {
    return c.json({ error: 'invalid handle — must be 4-32 alphanumeric chars, starting with a letter' }, 400);
  }

  try {
    const raw = await kv.get(CUSTOM_CHANNELS_KV_KEY);
    const channels: CustomChannelEntry[] = raw ? JSON.parse(raw) : [];

    if (channels.some((ch) => ch.handle.toLowerCase() === handle.toLowerCase())) {
      return c.json({ error: 'channel already added' }, 409);
    }

    channels.push({ handle, name, added_at: new Date().toISOString() });
    await kv.put(CUSTOM_CHANNELS_KV_KEY, JSON.stringify(channels));
    // Bump the cache key so the next reader gets fresh data
    await kv.put('tg:custom-channels:bump', Date.now().toString());
    // Drop the bump-shadow so the next read picks up the new value
    // immediately instead of waiting out the 60s shadow TTL.
    try {
      await (caches as unknown as { default: Cache }).default.delete(BUMP_SHADOW_CACHE_KEY);
    } catch {
      /* swallow */
    }

    return c.json({ ok: true, channel: { handle, name } }, 201);
  } catch {
    return c.json({ error: 'failed to save custom channel' }, 500);
  }
}

export async function telegramCustomChannelsDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not configured' }, 500);

  const handle = c.req.param('handle')?.trim().replace(/^@/, '');
  if (!handle) return c.json({ error: 'missing handle' }, 400);

  try {
    const raw = await kv.get(CUSTOM_CHANNELS_KV_KEY);
    const channels: CustomChannelEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = channels.filter((ch) => ch.handle.toLowerCase() !== handle.toLowerCase());
    if (filtered.length === channels.length) {
      return c.json({ error: 'channel not found' }, 404);
    }
    await kv.put(CUSTOM_CHANNELS_KV_KEY, JSON.stringify(filtered));
    await kv.put('tg:custom-channels:bump', Date.now().toString());
    try {
      await (caches as unknown as { default: Cache }).default.delete(BUMP_SHADOW_CACHE_KEY);
    } catch {
      /* swallow */
    }
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'failed to delete custom channel' }, 500);
  }
}
