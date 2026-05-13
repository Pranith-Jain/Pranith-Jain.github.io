import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 1800;
const FETCH_TIMEOUT_MS = 20_000;
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

// ─── Feed fetchers ──────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return res.json() as unknown;
  } catch {
    return null;
  }
}

const REDDIT_SUBS = [
  'netsec',
  'cybersecurity',
  'blueteamsec',
  'redteamsec',
  'malware',
  'reverseengineering',
  'computerforensics',
  'OSINT',
  'threatintel',
  'security',
  'bugbounty',
  'infosec',
  'cyber',
  'blackhat',
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
  const handles = [
    'malwaretech.com',
    'thedfirreport.bsky.social',
    'talosintelligence.com',
    'mandiant.com',
    'huntress.com',
    'sentinelone.com',
    'cti.fyi',
    'cyberalliance.bsky.social',
    'bushidotoken.net',
    'vanhoefm.bsky.social',
    'intel.overresearched.net',
    'campuscodi.bsky.social',
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

async function fetchWriteupsPulse(out: Map<string, PulseEntity>): Promise<void> {
  const data = await fetchJson('https://pranithjain.qzz.io/api/v1/writeups');
  if (!data) return;
  const items = (data as { items?: Array<{ title?: string; description?: string }> }).items ?? [];
  for (const item of items) {
    classifyEntities(`${item.title ?? ''} ${item.description ?? ''}`, 'writeups', out);
  }
}

async function fetchCybercrimePulse(out: Map<string, PulseEntity>): Promise<void> {
  const data = await fetchJson('https://pranithjain.qzz.io/api/v1/cyber-crime');
  if (!data) return;
  const items = (data as { items?: Array<{ title?: string; description?: string }> }).items ?? [];
  for (const item of items) {
    classifyEntities(`${item.title ?? ''} ${item.description ?? ''}`, 'cybercrime', out);
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function threatPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const entityMap = new Map<string, PulseEntity>();

  await Promise.all([
    fetchRedditPulse(entityMap),
    fetchBlueskyPulse(entityMap),
    fetchWriteupsPulse(entityMap),
    fetchCybercrimePulse(entityMap),
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
