import type { Context } from 'hono';
import type { Env } from '../env';
import {
  parseTweetFeed,
  parseSansIsc,
  parseC2IntelFeeds,
  parseUrlhaus,
  parseThreatfox,
  parsePlainTextIps,
  parseAlienVaultReputation,
} from '../lib/ioc-feed-parsers';
import { fetchMalwareSamplesCached } from './malware-samples';
import { fetchPhishingUrlsCached } from './phishing-urls';
import { trackEvent, visitorCountry } from '../lib/analytics';

/**
 * Live IOC stream — unified, time-ordered, per-entry-attributed.
 *
 * /api/v1/ioc-correlation answers "what's in 2+ feeds." This endpoint answers
 * "what's freshly observed and by whom." Each entry carries a reporter
 * handle / source tag and a timestamp; rendered chronologically the page
 * reads like a CTI firehose for individual indicators.
 *
 * Sources (live; all free; no auth):
 *   - TweetFeed (researcher Twitter posts, per-IOC permalink)
 *   - SANS ISC top attack sources (sensor-network telemetry)
 *   - C2IntelFeeds (Cobalt Strike + similar C2 IPs)
 *   - URLhaus recent (per-URL malware-family context)
 *   - ThreatFox recent (per-IOC malware-family + actor context)
 *   - Emerging Threats compromised-ips (Proofpoint ETOpen daily blocklist)
 *   - AlienVault OTX reputation (classified malicious IPs)
 *   - MalwareBazaar recent (file hashes + family signature)
 *   - OpenPhish (phishing URLs)
 *   - PhishTank (verified phishing URLs + brand attribution)
 *
 * Cached 30 min — these feeds churn faster than the correlation endpoint.
 */

export const LIVE_IOCS_CACHE_KEY = 'https://live-iocs-cache.internal/v10-adaptive-ttl';
const CACHE_KEY = LIVE_IOCS_CACHE_KEY;
const CACHE_TTL_SECONDS = 30 * 60;
const FETCH_TIMEOUT_MS = 12_000;
const PER_FEED_CAP = 300;
// Ceiling = PER_FEED_CAP × source-count. Previously 400 — small enough that
// the sort (timestamped-first, no-timestamp tail) silently dropped every
// untimestamped source (c2-intel, emerging-threats, otx-reputation, openphish)
// because the 4 timestamped sources alone produced >400 items.
const MAX_ITEMS = 3000;

type IocKind = 'ip' | 'url' | 'domain' | 'hash';

interface LiveIoc {
  value: string;
  kind: IocKind;
  source: string;
  /** Reporter handle (TweetFeed) or "—" for telemetry sources. */
  reporter?: string;
  /** Context: malware family, tags, or sensor stats. */
  context?: string;
  /** Permalink back to the source post when available (TweetFeed). */
  reference_url?: string;
  /** ISO 8601 — derived from feed entry; undefined for sources without per-entry time. */
  observed_at?: string;
}

interface LiveSource {
  id: string;
  ok: boolean;
  count: number;
  /**
   * Newest per-entry observation timestamp from this source's contributions,
   * derived from items[].observed_at. Undefined for sources that don't
   * publish per-entry timestamps (C2IntelFeeds, ET compromised-ips,
   * OTX reputation). UI can color-code freshness off this.
   */
  newest_observation?: string;
}

export interface LiveIocsResponse {
  generated_at: string;
  sources: LiveSource[];
  total: number;
  /** All items, sorted newest-first (entries without timestamp last). */
  items: LiveIoc[];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: '*/*' },
      cf: { cacheTtl: 1500, cacheEverything: true },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Parse a TweetFeed row to extract the permalink URL — last column. */
function tweetfeedPermalink(rawRow: string | undefined): string | undefined {
  if (!rawRow) return undefined;
  // Schema: date,source,type,ioc,tags,info_url
  const cols = rawRow.split(',');
  const url = cols[5]?.trim();
  if (url && url.startsWith('http')) return url;
  return undefined;
}

function isoFromLoose(s: string | undefined): string | undefined {
  if (!s) return undefined;
  // TweetFeed gives "YYYY-MM-DD HH:MM:SS" (UTC implied) — coerce to ISO.
  const candidate = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const t = Date.parse(candidate);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function iocKind(t: string): IocKind | null {
  if (t === 'ipv4') return 'ip';
  if (t === 'url') return 'url';
  if (t === 'domain') return 'domain';
  if (t === 'hash') return 'hash';
  return null;
}

export async function fetchLiveIocs(
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void },
  kv?: KVNamespace
): Promise<LiveIocsResponse> {
  const [
    tweetfeedText,
    sansIscText,
    c2IntelText,
    urlhausText,
    threatfoxText,
    etCompromisedText,
    otxReputationText,
    malwareBazaarResult,
    phishingResult,
  ] = await Promise.all([
    fetchText('https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/today.csv'),
    fetchText('https://isc.sans.edu/api/sources/attacks/200/?json'),
    fetchText('https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s.csv'),
    fetchText('https://urlhaus.abuse.ch/downloads/csv_recent/'),
    fetchText('https://threatfox.abuse.ch/export/csv/recent/'),
    fetchText('https://rules.emergingthreats.net/blockrules/compromised-ips.txt'),
    fetchText('https://reputation.alienvault.com/reputation.generic'),
    fetchMalwareSamplesCached(executionCtx).catch(() => null),
    fetchPhishingUrlsCached(executionCtx, kv).catch(() => null),
  ]);

  const items: LiveIoc[] = [];
  const sources: LiveSource[] = [];

  // ─── TweetFeed (richest source: per-entry reporter + permalink) ─────────
  if (tweetfeedText) {
    const parsed = parseTweetFeed(tweetfeedText, PER_FEED_CAP);
    // To pull the reporter + permalink we re-walk the raw CSV alongside
    // the parsed entries. parseTweetFeed iterates newest-first so we
    // match by value within the same pass.
    const rawRows = tweetfeedText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Index rows by IOC value so we can look up reporter + URL per entry.
    const rowByValue = new Map<string, string>();
    for (let i = rawRows.length - 1; i >= 0; i--) {
      const row = rawRows[i]!;
      const cols = row.split(',');
      const value = cols[3];
      if (value && !rowByValue.has(value)) rowByValue.set(value, row);
    }
    let count = 0;
    for (const p of parsed) {
      const kind = iocKind(p.type);
      if (!kind) continue;
      const row = rowByValue.get(p.value);
      const reporter = row?.split(',')[1] || undefined;
      const reference_url = tweetfeedPermalink(row);
      // Context tags come from parseTweetFeed (reporter | tags string); slice off the reporter half.
      const tagsPart = p.context?.includes(' | ') ? p.context.split(' | ').slice(1).join(' | ') : p.context;
      items.push({
        value: p.value,
        kind,
        source: 'tweetfeed',
        reporter,
        context: tagsPart,
        reference_url,
        observed_at: isoFromLoose(p.timestamp),
      });
      count++;
    }
    sources.push({ id: 'tweetfeed', ok: true, count });
  } else {
    sources.push({ id: 'tweetfeed', ok: false, count: 0 });
  }

  // ─── SANS ISC ───────────────────────────────────────────────────────────
  if (sansIscText) {
    const parsed = parseSansIsc(sansIscText, PER_FEED_CAP);
    for (const e of parsed) {
      items.push({
        value: e.value,
        kind: 'ip',
        source: 'sans-isc',
        reporter: 'ISC sensor network',
        context: e.context,
        observed_at: isoFromLoose(e.timestamp),
      });
    }
    sources.push({ id: 'sans-isc', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'sans-isc', ok: false, count: 0 });
  }

  // ─── C2IntelFeeds ───────────────────────────────────────────────────────
  if (c2IntelText) {
    const parsed = parseC2IntelFeeds(c2IntelText, PER_FEED_CAP);
    for (const e of parsed) {
      items.push({
        value: e.value,
        kind: 'ip',
        source: 'c2-intel',
        reporter: 'drb-ra/C2IntelFeeds',
        context: e.context,
      });
    }
    sources.push({ id: 'c2-intel', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'c2-intel', ok: false, count: 0 });
  }

  // ─── URLhaus ────────────────────────────────────────────────────────────
  if (urlhausText) {
    const parsed = parseUrlhaus(urlhausText, PER_FEED_CAP);
    for (const e of parsed) {
      if (e.type !== 'url') continue;
      items.push({
        value: e.value,
        kind: 'url',
        source: 'urlhaus',
        reporter: 'abuse.ch URLhaus',
        context: e.context,
        observed_at: isoFromLoose(e.timestamp),
      });
    }
    sources.push({ id: 'urlhaus', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'urlhaus', ok: false, count: 0 });
  }

  // ─── Emerging Threats compromised-ips: daily-curated bare IPs ───────────
  if (etCompromisedText) {
    const parsed = parsePlainTextIps(etCompromisedText, PER_FEED_CAP);
    for (const e of parsed) {
      items.push({
        value: e.value,
        kind: 'ip',
        source: 'emerging-threats',
        reporter: 'Proofpoint ETOpen',
        context: 'recent compromise / blocklist',
      });
    }
    sources.push({ id: 'emerging-threats', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'emerging-threats', ok: false, count: 0 });
  }

  // ─── AlienVault OTX reputation: IPs + classification ────────────────────
  if (otxReputationText) {
    const parsed = parseAlienVaultReputation(otxReputationText, PER_FEED_CAP);
    for (const e of parsed) {
      items.push({
        value: e.value,
        kind: 'ip',
        source: 'otx-reputation',
        reporter: 'AlienVault OTX',
        context: e.context,
      });
    }
    sources.push({ id: 'otx-reputation', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'otx-reputation', ok: false, count: 0 });
  }

  // ─── ThreatFox (mixed: url/domain/ip/hash) ──────────────────────────────
  if (threatfoxText) {
    const parsed = parseThreatfox(threatfoxText, PER_FEED_CAP);
    let count = 0;
    for (const e of parsed) {
      const kind = iocKind(e.type);
      if (!kind) continue;
      items.push({
        value: e.value,
        kind,
        source: 'threatfox',
        reporter: 'abuse.ch ThreatFox',
        context: e.context,
        observed_at: isoFromLoose(e.timestamp),
      });
      count++;
    }
    sources.push({ id: 'threatfox', ok: true, count });
  } else {
    sources.push({ id: 'threatfox', ok: false, count: 0 });
  }

  // ─── MalwareBazaar (hash samples with family + file-type context) ───────
  if (malwareBazaarResult) {
    let count = 0;
    for (const s of malwareBazaarResult.samples.slice(0, PER_FEED_CAP)) {
      const context =
        [s.signature, s.file_type].filter((x) => x && x !== 'unknown' && x !== 'n/a').join(' | ') || undefined;
      items.push({
        value: s.sha256,
        kind: 'hash',
        source: 'malwarebazaar',
        reporter: s.reporter || 'abuse.ch MalwareBazaar',
        context,
        reference_url: s.bazaar_url,
        observed_at: isoFromLoose(s.first_seen),
      });
      count++;
    }
    sources.push({ id: 'malwarebazaar', ok: true, count });
  } else {
    sources.push({ id: 'malwarebazaar', ok: false, count: 0 });
  }

  // ─── PhishTank + OpenPhish (verified phishing URLs; PhishTank carries brand attribution) ─
  if (phishingResult) {
    let openphishCount = 0;
    let phishtankCount = 0;
    for (const u of phishingResult.urls) {
      const reporter = u.source === 'phishtank' ? 'PhishTank' : 'OpenPhish';
      const context = u.target ? `brand: ${u.target}` : undefined;
      items.push({
        value: u.url,
        kind: 'url',
        source: u.source,
        reporter,
        context,
        observed_at: isoFromLoose(u.first_seen),
      });
      if (u.source === 'phishtank') phishtankCount++;
      else openphishCount++;
    }
    sources.push({ id: 'phishtank', ok: phishtankCount > 0, count: phishtankCount });
    sources.push({ id: 'openphish', ok: openphishCount > 0, count: openphishCount });
  } else {
    sources.push({ id: 'phishtank', ok: false, count: 0 });
    sources.push({ id: 'openphish', ok: false, count: 0 });
  }

  // Sort newest-first; entries without observed_at land at the tail.
  items.sort((a, b) => {
    if (a.observed_at && b.observed_at) return b.observed_at.localeCompare(a.observed_at);
    if (a.observed_at && !b.observed_at) return -1;
    if (!a.observed_at && b.observed_at) return 1;
    return 0;
  });

  // Per-source freshness: newest per-entry observation timestamp.
  // Sources without per-entry timestamps (C2IntelFeeds, ET compromised-ips,
  // OTX reputation) get newest_observation=undefined — UI renders that as
  // "no per-entry timestamp" so analysts know the data is bulk-snapshot,
  // not per-entry-dated.
  const newestBySource = new Map<string, string>();
  for (const it of items) {
    if (!it.observed_at) continue;
    const cur = newestBySource.get(it.source);
    if (!cur || it.observed_at > cur) newestBySource.set(it.source, it.observed_at);
  }
  for (const s of sources) {
    const newest = newestBySource.get(s.id);
    if (newest) s.newest_observation = newest;
  }

  return {
    generated_at: new Date().toISOString(),
    sources,
    total: items.length,
    items: items.slice(0, MAX_ITEMS),
  };
}

export async function liveIocsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) {
    trackEvent(c.env, 'live_iocs_fetch', {
      blobs: ['hit'],
      indexes: [visitorCountry(c.req.raw)],
    });
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'x-cache': 'HIT',
      },
    });
  }

  const body = await fetchLiveIocs(c.executionCtx, c.env.KV_CACHE);
  // Adaptive TTL: if any source returned 0 items (upstream flake + KV-restore
  // miss), cache only briefly so the next request retries instead of locking
  // the bad snapshot in for 30 min.
  const anyZero = body.sources.some((s) => s.count === 0);
  const ttl = anyZero ? 60 : CACHE_TTL_SECONDS;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttl}`,
      'x-cache': 'MISS',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  trackEvent(c.env, 'live_iocs_fetch', {
    blobs: ['miss'],
    doubles: [body.total, body.sources.filter((s) => s.ok).length],
    indexes: [visitorCountry(c.req.raw)],
  });
  return response;
}
