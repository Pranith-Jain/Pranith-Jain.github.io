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
  parseSslblC2,
  parseBotvrijDomains,
} from '../lib/ioc-feed-parsers';
import { fetchMalwareSamplesCached } from './malware-samples';
import { fetchPhishingUrlsCached } from './phishing-urls';
import { trackEvent, visitorCountry } from '../lib/analytics';
import { fetchAFDefacements } from '../lib/andreafortuna-feeds';
import { fetchMtiSource, type MtiIoc } from '../lib/mythreatintel-api';

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

export const LIVE_IOCS_CACHE_KEY = 'https://live-iocs-cache.internal/v11-freshness-filter';
const CACHE_KEY = LIVE_IOCS_CACHE_KEY;
const CACHE_TTL_SECONDS = 30 * 60;
const FETCH_TIMEOUT_MS = 12_000;
const PER_FEED_CAP = 300;
const AF_DEFACEMENTS_LASTGOOD_KEY = 'live-iocs/af-defacements-lastgood/v1';
const LASTGOOD_TTL_SECONDS = 24 * 60 * 60;
// Ceiling = PER_FEED_CAP × source-count. Previously 400 — small enough that
// the sort (timestamped-first, no-timestamp tail) silently dropped every
// untimestamped source (c2-intel, emerging-threats, otx-reputation, openphish)
// because the 4 timestamped sources alone produced >400 items.
const MAX_ITEMS = 3000;
// Freshness window for items WITH per-entry timestamps. Items observed
// before this cutoff are dropped — the page is called "live IOCs"; an
// indicator first seen weeks ago is rarely actionable. Bulk-snapshot
// sources (c2-intel, emerging-threats, otx-reputation) have no per-entry
// timestamps and are not affected by this filter — they reflect the
// upstream feed's current state by definition.
const STALENESS_HOURS = 24 * 7;

type IocKind = 'ip' | 'url' | 'domain' | 'hash';

export interface LiveIoc {
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
  /** True when the current data comes from the KV last-good fallback. */
  stale?: boolean;
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
  kv?: KVNamespace,
  env?: Env
): Promise<LiveIocsResponse> {
  const [
    tweetfeedText,
    sansIscText,
    c2IntelText,
    urlhausText,
    threatfoxText,
    etCompromisedText,
    otxReputationText,
    sslblText,
    botvrijText,
    malwareBazaarResult,
    phishingResult,
    afDefacementsRaw,
    mtiIocResult,
  ] = await Promise.all([
    fetchText('https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/today.csv'),
    fetchText('https://isc.sans.edu/api/sources/attacks/200/?json'),
    fetchText('https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s.csv'),
    fetchText('https://urlhaus.abuse.ch/downloads/csv_recent/'),
    fetchText('https://threatfox.abuse.ch/export/csv/recent/'),
    fetchText('https://rules.emergingthreats.net/blockrules/compromised-ips.txt'),
    fetchText('https://reputation.alienvault.com/reputation.generic'),
    fetchText('https://sslbl.abuse.ch/blacklist/sslipblacklist.csv'),
    fetchText('https://www.botvrij.eu/data/ioclist.domain'),
    fetchMalwareSamplesCached(executionCtx).catch(() => null),
    fetchPhishingUrlsCached(executionCtx, kv).catch(() => null),
    fetchAFDefacements().catch(() => [] as LiveIoc[]),
    env ? fetchMtiSource(env, 'iocs', { limit: PER_FEED_CAP }).catch(() => null) : Promise.resolve(null),
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

  // ─── SSLBL (abuse.ch) — SSL/TLS-fingerprinted botnet C2 IPs ─────────────
  if (sslblText) {
    const parsed = parseSslblC2(sslblText, PER_FEED_CAP);
    for (const e of parsed) {
      items.push({
        value: e.value,
        kind: 'ip',
        source: 'sslbl-c2',
        reporter: 'abuse.ch SSLBL',
        context: e.context,
        observed_at: isoFromLoose(e.timestamp),
      });
    }
    sources.push({ id: 'sslbl-c2', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'sslbl-c2', ok: false, count: 0 });
  }

  // ─── Botvrij.eu — curated malicious domains ─────────────────────────────
  if (botvrijText) {
    const parsed = parseBotvrijDomains(botvrijText, PER_FEED_CAP);
    for (const e of parsed) {
      items.push({
        value: e.value,
        kind: 'domain',
        source: 'botvrij',
        reporter: 'Botvrij.eu',
        context: e.context,
      });
    }
    sources.push({ id: 'botvrij', ok: true, count: parsed.length });
  } else {
    sources.push({ id: 'botvrij', ok: false, count: 0 });
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

  // ─── Andrea Fortuna Defacements (defaced site URLs) ────────────────────
  let afDefacements = afDefacementsRaw ?? [];
  let afDefacementsOk = afDefacements.length > 0;
  let afDefacementsStale = false;

  if (afDefacementsOk && kv) {
    executionCtx?.waitUntil(
      kv.put(
        AF_DEFACEMENTS_LASTGOOD_KEY,
        JSON.stringify({ items: afDefacements, refreshed_at: new Date().toISOString() }),
        { expirationTtl: LASTGOOD_TTL_SECONDS }
      )
    );
  } else if (!afDefacementsOk && kv) {
    try {
      const raw = await kv.get(AF_DEFACEMENTS_LASTGOOD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { items: typeof afDefacements };
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          afDefacements = parsed.items;
          afDefacementsOk = true;
          afDefacementsStale = true;
        }
      }
    } catch {
      /* leave ok = false */
    }
  }

  for (const e of afDefacements) {
    items.push(e);
  }

  const newestAf = afDefacements
    .map((i) => i.observed_at)
    .filter((t): t is string => Boolean(t))
    .sort()
    .pop();

  sources.push({
    id: 'andreafortuna-defacements',
    ok: afDefacementsOk,
    count: afDefacements.length,
    ...(newestAf ? { newest_observation: newestAf } : {}),
    ...(afDefacementsStale ? { stale: true } : {}),
  });

  // ─── MyThreatIntel REST API (sha256 IOCs + family/tags) ─────────────────
  // Token-gated: when MYTHREATINTEL_API_TOKEN is unset (dev/preview) or the
  // upstream is unhealthy, mtiIocResult is null / not-ok and this source is
  // simply absent — the existing single-source-down tolerance covers it.
  if (mtiIocResult && mtiIocResult.ok && mtiIocResult.items.length > 0) {
    let count = 0;
    for (const raw of mtiIocResult.items.slice(0, PER_FEED_CAP)) {
      const r = raw as MtiIoc;
      if (!r.sha256) continue;
      const context =
        [r.signature, r.file_name, r.tags, r.type]
          .map((x) => x?.trim())
          .filter((x): x is string => Boolean(x) && x !== 'N/D')
          .join(' | ') || undefined;
      items.push({
        value: r.sha256,
        kind: 'hash',
        source: 'mythreatintel',
        reporter: 'MyThreatIntel',
        context,
        observed_at: isoFromLoose(r.date),
      });
      count++;
    }
    sources.push({ id: 'mythreatintel', ok: count > 0, count });
  } else {
    sources.push({ id: 'mythreatintel', ok: false, count: 0 });
  }

  // Drop stale items — observed before the freshness cutoff. Items without
  // observed_at survive (they're bulk-snapshot feeds whose freshness is
  // governed by the upstream publish cadence, not per-entry).
  const staleCutoffMs = Date.now() - STALENESS_HOURS * 3600 * 1000;
  const staleCutoffIso = new Date(staleCutoffMs).toISOString();
  const freshItems = items.filter((it) => !it.observed_at || it.observed_at >= staleCutoffIso);

  // Sort newest-first; entries without observed_at land at the tail.
  freshItems.sort((a, b) => {
    if (a.observed_at && b.observed_at) return b.observed_at.localeCompare(a.observed_at);
    if (a.observed_at && !b.observed_at) return -1;
    if (!a.observed_at && b.observed_at) return 1;
    return 0;
  });

  // Recompute per-source counts after the freshness filter — the response
  // should not advertise contribution counts that include dropped stale items.
  const freshCountBySource = new Map<string, number>();
  for (const it of freshItems) {
    freshCountBySource.set(it.source, (freshCountBySource.get(it.source) ?? 0) + 1);
  }
  for (const s of sources) {
    s.count = freshCountBySource.get(s.id) ?? 0;
    if (s.count === 0) s.ok = false;
  }

  // Drop silent-failure sources from the response — sources that returned
  // zero usable items are noise in the UI and look like permanent breakage
  // when they're often a one-off upstream hiccup. They'll be re-tried on the
  // next cache miss.
  const activeSources = sources.filter((s) => s.count > 0);

  // Per-source freshness: newest per-entry observation timestamp.
  // Sources without per-entry timestamps (C2IntelFeeds, ET compromised-ips,
  // OTX reputation) get newest_observation=undefined — UI renders that as
  // "no per-entry timestamp" so analysts know the data is bulk-snapshot,
  // not per-entry-dated.
  const newestBySource = new Map<string, string>();
  for (const it of freshItems) {
    if (!it.observed_at) continue;
    const cur = newestBySource.get(it.source);
    if (!cur || it.observed_at > cur) newestBySource.set(it.source, it.observed_at);
  }
  for (const s of activeSources) {
    const newest = newestBySource.get(s.id);
    if (newest) s.newest_observation = newest;
  }

  return {
    generated_at: new Date().toISOString(),
    sources: activeSources,
    total: freshItems.length,
    items: freshItems.slice(0, MAX_ITEMS),
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

  const body = await fetchLiveIocs(c.executionCtx, c.env.KV_CACHE, c.env);
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
