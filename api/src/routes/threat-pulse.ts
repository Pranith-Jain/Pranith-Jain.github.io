import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchTelegramFeed, TELEGRAM_FEED_CACHE_KEY } from './telegram-feed';
import { fetchWriteups, WRITEUPS_CACHE_KEY } from './writeups';
import { fetchCybercrime, CYBERCRIME_CACHE_KEY } from './cybercrime';
import { fetchXLive } from './x-live';
import { fetchAuthedTimeline, XAuthMissingError } from '../lib/twitter-auth-graphql';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { ATTACK_ID_INDEX } from '../data/attack-id-index';

/**
 * Read a same-origin feed by checking the edge cache first, then falling
 * back to the in-memory fetch helper. This is the cheapest way to share
 * data between handlers — every public handler writes to that cache key
 * after its first successful upstream fetch, so we usually hit warm cache.
 */
async function readCachedFeed<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cached = await cache.match(new Request(cacheKey));
    if (cached) {
      return (await cached.json()) as T;
    }
  } catch {
    /* cold cache or cache lookup failed — fall through to live fetch */
  }
  try {
    return await fetcher();
  } catch {
    return null;
  }
}

const CACHE_TTL = 1800;
const UA = 'Mozilla/5.0 (compatible; pranithjain-threat-pulse/1.0; +https://pranithjain.qzz.io)';

/** Entity extracted from feed content. */
interface PulseEntity {
  /** Canonical label — CVE ID, actor slug, technique ID, malware name. */
  label: string;
  /** Entity type for UI filtering. */
  kind: 'cve' | 'actor' | 'technique' | 'malware';
  /** Number of distinct feed surfaces that mentioned this entity. */
  source_count: number;
  /** Which surfaces saw it. */
  sources: string[];
}

interface PulseResponse {
  generated_at: string;
  entities: PulseEntity[];
}

// ─── Regex patterns ──────────────────────────────────────────────────────────

const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const MITRE_TECH_RE = /\bT\d{4}(?:\.\d{3})?\b/g;

// Pre-built actor index: every name + alias (lowercased) → canonical slug.
// Sourced from the same ACTOR_ALIASES used elsewhere on the platform, so
// pulse coverage tracks the rest of the codebase instead of drifting from
// a hard-coded subset (the previous list was 33 entries — ACTOR_ALIASES
// has 150+ including all MITRE groups, ransomware brands, and country
// nation-state aliases).
const ACTOR_LOOKUP: Array<{ slug: string; name: string; pattern: RegExp }> = (() => {
  const out: Array<{ slug: string; name: string; pattern: RegExp }> = [];
  for (const a of ACTOR_ALIASES) {
    const allNames = [a.canonical, ...a.aliases];
    for (const n of allNames) {
      const trimmed = n.trim();
      if (trimmed.length < 3) continue; // 2-letter aliases are noise (e.g. "FB")
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      out.push({
        slug: a.slug,
        name: a.canonical,
        pattern: new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i'),
      });
    }
  }
  return out;
})();

/** Extract known actor slugs from text (case-insensitive). Returns slugs,
 *  not display names — the FE renders the canonical name from the slug. */
function extractActors(text: string): Set<string> {
  if (text.length < 3) return new Set();
  const found = new Set<string>();
  for (const a of ACTOR_LOOKUP) {
    if (found.has(a.slug)) continue; // skip dup work once we matched any alias
    if (a.pattern.test(text)) found.add(a.slug);
  }
  return found;
}

/** Extract all CVE IDs from text. */
function extractCves(text: string): Set<string> {
  return new Set([...text.matchAll(CVE_RE)].map((m) => m[0].toUpperCase()));
}

/** Extract MITRE technique IDs from text — validated against the canonical
 *  ATT&CK index so noise like "T1234" tax-form references doesn't slip in
 *  alongside real techniques. */
function extractTechniques(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(MITRE_TECH_RE)) {
    const id = m[0].toUpperCase();
    if (ATTACK_ID_INDEX[id]) out.add(id);
  }
  return out;
}

/** Extract likely malware names (alphanumeric + hyphen strings adjacent to keywords). */
const MALWARE_HINT_RE =
  /(?:malware|rat|botnet|backdoor|trojan|stealer|worm|dropper|loader|infostealer)\s+["']?([a-zA-Z][a-zA-Z0-9._-]{2,30})["']?/gi;

function extractMalware(text: string): Set<string> {
  return new Set(
    [...text.matchAll(MALWARE_HINT_RE)]
      .map((m) => m[1]?.trim())
      .filter((n): n is string => !!n && n.length >= 3 && !/^\d/.test(n))
  );
}

function mergeEntity(m: Map<string, PulseEntity>, kind: PulseEntity['kind'], label: string, source: string): void {
  const key = `${kind}:${label.toLowerCase()}`;
  const existing = m.get(key);
  if (existing) {
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
      existing.source_count = existing.sources.length;
    }
  } else {
    m.set(key, { label, kind, source_count: 1, sources: [source] });
  }
}

function classifyEntities(text: string, source: string, out: Map<string, PulseEntity>): void {
  for (const cve of extractCves(text)) mergeEntity(out, 'cve', cve, source);
  for (const t of extractTechniques(text)) mergeEntity(out, 'technique', t, source);
  for (const a of extractActors(text)) mergeEntity(out, 'actor', a, source);
  for (const m of extractMalware(text)) mergeEntity(out, 'malware', m, source);
}

// 16 subs total — kept under the parallel-fetch budget that the
// Cloudflare worker has across all surface fetchers (~50 subrequests/req).
const REDDIT_SUBS = [
  'netsec',
  'cybersecurity',
  'blueteamsec',
  'malware',
  'reverseengineering',
  'computerforensics',
  'OSINT',
  'threatintel',
  'security',
  'bugbounty',
  'AskNetsec',
  'ransomware',
  'hacking',
  'antivirus',
  'privacy',
  'infosec',
];

async function fetchRedditPulse(out: Map<string, PulseEntity>): Promise<void> {
  const results = await Promise.allSettled(
    REDDIT_SUBS.map(async (sub) => {
      const res = await fetch(`https://www.reddit.com/r/${sub}/.rss?limit=5`, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; pranithjain-threat-pulse/1.0)',
          accept: 'application/atom+xml',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const entries = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/g)];
      for (const entry of entries) {
        const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry[0])?.[1] ?? '';
        const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry[0])?.[1] ?? '';
        const blob = `${title} ${content}`.replace(/<[^>]+>/g, '');
        classifyEntities(blob, `reddit:${sub}`, out);
      }
    })
  );
  void results;
}

async function fetchBlueskyPulse(out: Map<string, PulseEntity>): Promise<void> {
  // 16 handles — capped so total fanout (Reddit 16 + Bsky 16 + Mastodon 8
  // + 3 internal cache reads = 43) fits under Cloudflare's 50-subrequest
  // ceiling. Verified handles only.
  const handles = [
    'malwaretech.com',
    'thedfirreport.bsky.social',
    'talosintelligence.com',
    'mandiant.com',
    'huntress.com',
    'sentinelone.com',
    'campuscodi.bsky.social',
    'briankrebs.bsky.social',
    'swiftonsecurity.bsky.social',
    'volexity.bsky.social',
    'unit42.paloaltonetworks.com',
    'crowdstrike.com',
    'recordedfuture.com',
    'cti.fyi',
    'bushidotoken.net',
    'cyberalliance.bsky.social',
  ];
  const results = await Promise.allSettled(
    handles.map(async (handle) => {
      const res = await fetch(`https://bsky.app/profile/${handle}/rss`, {
        headers: { 'user-agent': UA, accept: 'application/rss+xml' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const entries = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)];
      for (const entry of entries) {
        const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry[0])?.[1] ?? '';
        const desc = /<description[^>]*>([\s\S]*?)<\/description>/.exec(entry[0])?.[1] ?? '';
        const blob = `${title} ${desc}`.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        classifyEntities(blob, `bsky:${handle}`, out);
      }
    })
  );
  void results;
}

/**
 * Mastodon — infosec.exchange (the de-facto cybersec instance). Each
 * account exposes /users/<handle>.rss with a simple Atom feed. Tagged as
 * `mastodon:<handle>` so cross-source counting treats each researcher as
 * an independent surface.
 */
async function fetchMastodonPulse(out: Map<string, PulseEntity>): Promise<void> {
  // 8 handles — capped for subrequest budget. Names verified against
  // x-feed.ts's curated FEEDS list (those handles are liveness-tested).
  const handles = [
    'GossiTheDog', // Kevin Beaumont
    'campuscodi', // Catalin Cimpanu
    'malwaretech', // Marcus Hutchins
    'cyb3rops', // Florian Roth
    'mttaggart',
    'x0rz',
    'vxunderground',
    'briankrebs',
  ];
  const results = await Promise.allSettled(
    handles.map(async (handle) => {
      const res = await fetch(`https://infosec.exchange/users/${handle}.rss`, {
        headers: { 'user-agent': UA, accept: 'application/rss+xml' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const entries = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)];
      for (const entry of entries) {
        const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry[0])?.[1] ?? '';
        const desc = /<description[^>]*>([\s\S]*?)<\/description>/.exec(entry[0])?.[1] ?? '';
        const blob = `${title} ${desc}`.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        classifyEntities(blob, `mastodon:${handle}`, out);
      }
    })
  );
  void results;
}

async function fetchWriteupsPulse(out: Map<string, PulseEntity>): Promise<void> {
  type WriteupItem = { title?: string; description?: string };
  const data = await readCachedFeed<{ items: WriteupItem[] }>(WRITEUPS_CACHE_KEY, fetchWriteups);
  if (!data) return;
  for (const item of data.items ?? []) {
    classifyEntities(`${item.title ?? ''} ${item.description ?? ''}`, 'writeups', out);
  }
}

async function fetchCybercrimePulse(out: Map<string, PulseEntity>): Promise<void> {
  type CybercrimeItem = { title?: string; description?: string };
  const data = await readCachedFeed<{ items: CybercrimeItem[] }>(CYBERCRIME_CACHE_KEY, fetchCybercrime);
  if (!data) return;
  for (const item of data.items ?? []) {
    classifyEntities(`${item.title ?? ''} ${item.description ?? ''}`, 'cybercrime', out);
  }
}

/**
 * Pulls the curated cybersec Telegram channel firehose and extracts CVEs,
 * actors, techniques, and malware mentions per channel. Each channel is its
 * OWN surface (`tg:<handle>`) so cross-source counting treats them as
 * independent — the same way Reddit subreddits are counted independently.
 *
 * Calls fetchTelegramFeed() directly (not via HTTP) — worker→same-worker
 * sub-requests don't work reliably under Cloudflare's recursion model, so
 * we share the same in-memory function the public handler uses.
 */
async function fetchTelegramPulse(out: Map<string, PulseEntity>): Promise<void> {
  type TgItem = { channel_handle?: string; text?: string };
  const data = await readCachedFeed<{ items: TgItem[] }>(TELEGRAM_FEED_CACHE_KEY, fetchTelegramFeed);
  if (!data) return;
  for (const item of data.items ?? []) {
    if (!item.channel_handle) continue;
    classifyEntities(item.text ?? '', `tg:${item.channel_handle}`, out);
  }
}

/**
 * Pulls the cybersec X firehose (TweetFeed × fxtwitter hybrid) and
 * extracts CVE / actor / technique / malware mentions per tweet. Each
 * tweet's author handle becomes its own surface (`x:<handle>`), so the
 * cross-source counter treats different X researchers as independent —
 * the same way Reddit subreddits + Telegram channels are counted.
 *
 * Calls `fetchXLive()` in-process (not via HTTP) so the worker → same-
 * worker round-trip is avoided. The TweetFeed CSV + fxtwitter responses
 * are both edge-cached, so this typically uses one cold subrequest to
 * TweetFeed plus zero-or-few fxtwitter calls after warm-up.
 */
/**
 * High-CTI X handles for pulse. These are accounts whose tweets discuss
 * named actors / CVEs / malware (the entities the pulse classifier
 * looks for), as opposed to TweetFeed's IOC-drop accounts (URLs/hashes
 * only, which the classifier can't match against actor/CVE/MITRE
 * dictionaries). Capped at 5 handles to fit the per-Worker subrequest
 * budget alongside Reddit/Bluesky/Mastodon/Telegram/writeups/cybercrime.
 *
 * Each handle's response is per-handle-cached at the firehose layer
 * (30min), so warm pulse runs use zero X subrequests.
 */
const X_PULSE_HANDLES = [
  'DailyDarkWeb', // breach + ransomware coverage by name
  'ransomnews', // ransomware activity (group names, CVE IDs)
  'MonThreat', // CTI summary feed
  'VivekIntel', // CTI summaries with actor attribution
  'vxunderground', // researcher commentary, often mentions APTs by name
];

async function fetchXPulse(env: Env, out: Map<string, PulseEntity>): Promise<void> {
  // Try the cookie-authenticated firehose first — gives the chronological
  // timeline with actor / CVE / malware discussion. Falls back silently
  // when cookies aren't configured (Pulse degrades to other sources).
  try {
    const results = await Promise.allSettled(
      X_PULSE_HANDLES.map((handle) => fetchAuthedTimeline(env, handle, { count: 10, sinceDays: 3 }))
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const item of r.value.items) {
        const sn = item.author.screen_name || 'unknown';
        classifyEntities(item.text ?? '', `x:${sn}`, out);
      }
    }
  } catch (err) {
    // Either cookies not configured, or transient error. Either is fine
    // — the IOC-feed-based fallback below still runs.
    if (!(err instanceof XAuthMissingError)) {
      console.warn('threat-pulse: authed X path failed', (err as Error).message);
    }
  }

  // Also pull the TweetFeed IOC-tweets. These tweets often contain
  // researcher commentary alongside the IOC, which CAN match the
  // entity dictionary even though it's not the primary purpose.
  try {
    const data = await fetchXLive({ sinceHours: 24, limit: 8 });
    for (const item of data.items ?? []) {
      const handle = item.author.screen_name || 'unknown';
      classifyEntities(item.text ?? '', `x:${handle}`, out);
    }
  } catch {
    /* swallow — already have whatever the authed path yielded */
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function threatPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const entityMap = new Map<string, PulseEntity>();

  // allSettled, not all: each fetcher is best-effort and individually
  // catches upstream failure, but an unexpected throw in any one of them
  // (parser edge case, etc.) must not blank the entire pulse — surface
  // whatever the other sources produced.
  await Promise.allSettled([
    fetchRedditPulse(entityMap),
    fetchBlueskyPulse(entityMap),
    fetchMastodonPulse(entityMap),
    fetchWriteupsPulse(entityMap),
    fetchCybercrimePulse(entityMap),
    fetchTelegramPulse(entityMap),
    fetchXPulse(c.env, entityMap),
  ]);

  const entities = [...entityMap.values()].sort(
    (a, b) => b.source_count - a.source_count || a.label.localeCompare(b.label)
  );

  const body: PulseResponse = {
    generated_at: new Date().toISOString(),
    entities,
  };

  return c.json(body, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
}
