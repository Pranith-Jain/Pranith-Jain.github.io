import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchTelegramFeed, TELEGRAM_FEED_CACHE_KEY } from './telegram-feed';
import { fetchWriteups, WRITEUPS_CACHE_KEY } from './writeups';
import { fetchCybercrime, CYBERCRIME_CACHE_KEY } from './cybercrime';

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

// Known ransomware/APT slugs — kept in sync with ransomware-mitre-groups.ts
const KNOWN_ACTORS = new Set([
  'lockbit',
  'alphv',
  'blackcat',
  'cl0p',
  'clop',
  'akira',
  'play',
  'playcrypt',
  'black basta',
  'blackbasta',
  'royal',
  'medusa',
  'bianlian',
  'qilin',
  'agenda',
  'conti',
  'revil',
  'sodinokibi',
  'darkside',
  'blackbyte',
  'hive',
  'ryuk',
  'ragnarlocker',
  'rhysida',
  'lazarus',
  'lazarus-group',
  'fancy-bear',
  'apt28',
  'apt29',
  'cozy-bear',
  'apt41',
  'winnti',
  'kimsuky',
  'scarcruft',
  'ta505',
  'silk-tempest',
  'volt-typhoon',
  'storm-1175',
  'shinyhunters',
  'teampcp',
  'handala',
  'unc6692',
]);

/** Extract known actor slugs from text (case-insensitive, word-boundary). */
function extractActors(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const actor of KNOWN_ACTORS) {
    const escaped = actor.replace(/ /g, '\\s');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      found.add(actor);
    }
  }
  return found;
}

/** Extract all CVE IDs from text. */
function extractCves(text: string): Set<string> {
  return new Set([...text.matchAll(CVE_RE)].map((m) => m[0].toUpperCase()));
}

/** Extract MITRE technique IDs from text. */
function extractTechniques(text: string): Set<string> {
  return new Set([...text.matchAll(MITRE_TECH_RE)].map((m) => m[0].toUpperCase()));
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

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function threatPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const entityMap = new Map<string, PulseEntity>();

  await Promise.all([
    fetchRedditPulse(entityMap),
    fetchBlueskyPulse(entityMap),
    fetchMastodonPulse(entityMap),
    fetchWriteupsPulse(entityMap),
    fetchCybercrimePulse(entityMap),
    fetchTelegramPulse(entityMap),
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
