/**
 * Parser for t.me/s/cvenotify — a high-cadence CVE disclosure firehose.
 *
 * Message format (verified 2026-07-29):
 *
 *   🚨 CVE-2026-65886Joomla Extension - balbooa.com - Unauthenticated arbitrary file read ...
 *   🎖@cveNotify
 *
 * Each post is a single line: the 🚨 emoji, the CVE ID immediately followed
 * by the description (no separator), then a trailing 🎖@cveNotify signature.
 * There are no structured severity / CVSS / date fields — the channel is a
 * pure "CVE ID + description" relay, so severity is left UNKNOWN and the
 * publish timestamp comes from Telegram's `<time datetime>` element.
 *
 * Why this module: cve-recent uses it as a 5th gap-filler source (alongside
 * NVD, CISA KEV, mythreatintel, and cvefeed.io). cvenotify often surfaces
 * vendor advisories and GitHub-published CVEs before NVD does, so it
 * extends the "not yet in NVD" coverage that MTI and cvefeed.io provide.
 */

const CVENOTIFY_URL = 'https://t.me/s/cvenotify';
const FETCH_TIMEOUT_MS = 12_000;
const SHARED_CACHE_KEY = 'https://cvenotify-html-cache.internal/v1';
const SHARED_CACHE_TTL_SECONDS = 300; // 5 minutes — channel posts at high cadence

/**
 * One parsed CVE alert from the channel. The channel carries no severity
 * or CVSS data, so those fields are absent; consumers derive severity
 * from NVD when the CVE lands there.
 */
export interface CveNotifyCve {
  cve_id: string;
  /** ISO 8601 from Telegram's <time datetime>. */
  published: string;
  description?: string;
  /** Telegram permalink to the original message. */
  permalink: string;
}

/**
 * Fetch and cache the channel's HTML. Returns null on upstream failure so
 * consumers can degrade gracefully.
 */
async function fetchCveNotifyHtml(): Promise<string | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(SHARED_CACHE_KEY);
    if (cached) return cached.text();
    const res = await fetch(CVENOTIFY_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 pranithjain.qzz.io/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.text();
    const toCache = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': `public, max-age=${SHARED_CACHE_TTL_SECONDS}`,
      },
    });
    await cache.put(SHARED_CACHE_KEY, toCache);
    return body;
  } catch {
    return null;
  }
}

/** Telegram `tgme_widget_message` block walker. */
interface RawMsg {
  permalink: string;
  datetime: string;
  text: string;
}

function* iterateMessages(html: string): Generator<RawMsg> {
  const msgRe = /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = msgRe.exec(html)) !== null) {
    const block = m[0];
    const post = m[1];
    if (!block || !post) continue;
    const datetime = /<time[^>]*datetime="([^"]+)"/.exec(block)?.[1] ?? '';
    const textMatch = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block);
    if (!textMatch || !textMatch[1]) continue;
    const text = textMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#33;/g, '!')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/gi, '/')
      .trim();
    yield {
      permalink: `https://t.me/${post}`,
      datetime,
      text,
    };
  }
}

const CVE_ID_RE = /CVE-\d{4}-\d{4,7}/i;

/**
 * Extract CVE alerts from the channel's HTML.
 * Returns newest-first (per Telegram's render order).
 */
export async function fetchCveNotifyCves(): Promise<CveNotifyCve[]> {
  const html = await fetchCveNotifyHtml();
  if (!html) return [];
  const out: CveNotifyCve[] = [];
  for (const msg of iterateMessages(html)) {
    // Every CVE post starts with the 🚨 emoji. Skip non-CVE posts (channel
    // occasionally pins promo / partner messages).
    if (!msg.text.includes('🚨')) continue;
    const cveId = CVE_ID_RE.exec(msg.text)?.[0];
    if (!cveId) continue;
    // Description is everything after the CVE ID, with the trailing
    // "🎖@cveNotify" signature stripped.
    const afterId = msg.text.slice(msg.text.indexOf(cveId) + cveId.length);
    const description = afterId
      .replace(/🎖\s*@cveNotify/i, '')
      .replace(/\n+/g, ' ')
      .trim();
    out.push({
      cve_id: cveId.toUpperCase(),
      published: msg.datetime,
      ...(description ? { description: description.slice(0, 600) } : {}),
      permalink: msg.permalink,
    });
  }
  return out;
}
