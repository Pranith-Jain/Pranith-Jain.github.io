/**
 * CyberPulse — breach/leak/intel incident ingestion pipeline.
 *
 * Monitors X/Twitter (authenticated GraphQL), Telegram, Bluesky, and Mastodon
 * firehose for breach, leak, ransomware, extortion, and cybercrime posts.
 * Classifies, deduplicates, and stores structured incidents in D1.
 *
 * Cron: runs hourly via worker/scheduled.ts ( piggybacks on the `0 * * * *` tick).
 * Cost: X auth GraphQL ≈ 1 req/handle (30-min edge cache), Telegram ≈ 22 HTML fetches,
 *       Bluesky/Mastodon ≈ 15 RSS fetches. Well within the 50-subrequest free plan.
 */
import type { D1Database } from '@cloudflare/workers-types';
import {
  fetchAuthedTimeline,
  fetchSearchTimeline,
  readAuthCookies,
  XAuthMissingError,
} from '../lib/twitter-auth-graphql';
import { fetchTelegramFeed, type TelegramFeedItem } from './telegram-feed';
import { fetchXFeed, type XFeedItem } from './x-feed';
import type { Env } from '../env';

/**
 * Optionally pre-fetched feed data, threaded in by the caller.
 *
 * The hourly cron already fetches the Telegram feed once (worker/scheduled.ts,
 * telegram-leak-scanner) before this ingestion runs. Re-fetching the same t.me
 * channels a second time in the same tick trips t.me's per-egress-IP burst
 * throttle, so the duplicate fetch silently returns nothing and CyberPulse's
 * Telegram source found 0 items every hour. Reusing the already-fetched items
 * avoids the throttled duplicate burst entirely.
 */
export interface CyberPulsePrefetch {
  telegramItems?: TelegramFeedItem[];
  socialItems?: XFeedItem[];
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type IncidentType =
  | 'ransomware'
  | 'data_leak'
  | 'credential_leak'
  | 'extortion'
  | 'defacement'
  | 'supply_chain'
  | 'zero_day'
  | 'breach'
  | 'ddos'
  | 'hacktivism'
  | 'other';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Platform = 'x' | 'telegram' | 'bluesky' | 'mastodon' | 'manual' | 'rss' | 'other';

export type Sector =
  | 'healthcare'
  | 'finance'
  | 'government'
  | 'education'
  | 'technology'
  | 'retail'
  | 'energy'
  | 'manufacturing'
  | 'telecom'
  | 'media'
  | 'transportation'
  | 'legal'
  | 'nonprofit'
  | 'other';

export interface CyberPulseIncident {
  id: string;
  incident_type: IncidentType;
  severity: Severity;
  victim_name: string | null;
  victim_domain: string | null;
  victim_sector: Sector | null;
  victim_country: string | null;
  threat_actor: string | null;
  threat_actor_aliases: string;
  title: string;
  description: string | null;
  data_types_leaked: string;
  records_count: number | null;
  data_volume: string | null;
  source_platform: Platform;
  source_url: string | null;
  source_handle: string | null;
  source_text: string | null;
  source_author: string | null;
  source_avatar: string | null;
  confidence: number;
  classification_method: string;
  discovered_at: string;
  reported_at: string | null;
  updated_at: string;
  dedup_hash: string | null;
  duplicate_of: string | null;
  tags: string;
  mitre_techniques: string;
  source_likes: number;
  source_retweets: number;
  source_replies: number;
  source_views: number;
}

export interface IngestResult {
  source: string;
  items_scanned: number;
  incidents_created: number;
  incidents_deduped: number;
  errors: string[];
  duration_ms: number;
}

// ─── Keyword patterns for classification ────────────────────────────────────

const INCIDENT_PATTERNS: Record<IncidentType, RegExp[]> = {
  ransomware: [
    /ransomware/i,
    /ransom\s*ware/i,
    /\bransom\b.*\battack\b/i,
    /\bransom\b.*\bvictim\b/i,
    /\bransom\b.*\bclaim/i,
    /lockbit|blackcat|alphv|cl0p|play|akira|black\s*basta|medusa|hunters|clop/i,
    /leak\s*site.*(?:added|new|post)/i,
    /data\s*(?:will\s*)?(?:be\s*)?leaked/i,
    /pay\s*or\s*(?:your|we)/i,
    /double\s*extort/i,
  ],
  data_leak: [
    /data\s*leak/i,
    /leaked\s*data/i,
    /data\s*(?:dump|breach|exposed)/i,
    /\bleak(?:ed|ing|s)?\b.*\b(?:database|records?|data|info)/i,
    /(?:database|records?|data|info)\b.*\b(?:leaked|exposed|dumped)/i,
    /(?:millions?|thousands?|billions?)\s*(?:of\s*)?(?:records?|accounts?|users?)/i,
    /full\s*(?:dump|database)/i,
    /pastebin|ghostbin|rentry/i,
  ],
  credential_leak: [
    /credential/i,
    /(?:stolen|exposed|leaked|compromised)\s*(?:password|credential|login)/i,
    /infostealer|stealer\s*log/i,
    /redline|raccoon|vidar|meta\s*infostealer|lumma/i,
    /combo\s*(?:list|dump)/i,
    /email.*password.*(?:leaked|exposed|dumped)/i,
  ],
  extortion: [
    /extort/i,
    /(?:threat|attempt)ing?\s*to\s*(?:extort|blackmail)/i,
    /pay\s*or\s*(?:we|your)/i,
    /(?:expose|publish|release)\s*(?:your|sensitive|private)/i,
    /sextortion/i,
  ],
  defacement: [
    /defac(?:ed?|ement|ing)/i,
    /hack(?:ed?|ing)?\s*(?:website|site|page)/i,
    /website\s*(?:compromised|hacked|defaced)/i,
  ],
  supply_chain: [
    /supply\s*chain/i,
    /(?:backdoor|trojan)\s*(?:in|found\s*in|discovered\s*in)/i,
    /compromised\s*(?:package|update|dependency|library)/i,
    /npm|pypi|crate|gems?\b.*\b(?:malicious|compromised)/i,
    /codecov|solarwinds|3cx|moveit|citrix/i,
  ],
  zero_day: [/0[\s-]?day/i, /zero[\s-]?day/i, /actively\s*exploited/i, /in[\s-]?the[\s-]?wild/i, /unpatched\s*vuln/i],
  breach: [
    /(?:confirmed|suffered|experienced|hit\s*(?:by|with))\s*(?:a\s*)?breach/i,
    /data\s*breach/i,
    /security\s*breach/i,
    /unauthorized\s*access/i,
    /cyber\s*(?:attack|incident)/i,
    /network\s*(?:compromised|breach|incident)/i,
  ],
  ddos: [/\bddos\b/i, /denial[\s-]of[\s-]service/i, /(?:taken\s*down|knocked\s*(?:offline|out))\s*(?:by|via|with)/i],
  hacktivism: [
    /hacktivist/i,
    /(?:anonymous|ghostsec|killnet|no\s*name|ldz|mkv)\s*(?:claimed|hits?|attacks?)/i,
    /(?:political|ideological)\s*(?:hack|attack)/i,
  ],
  other: [/cyber(?:crime|security)/i, /threat\s*actor/i, /apt[\s-]?\d+/i],
};

const SEVERITY_KEYWORDS: Record<Severity, RegExp[]> = {
  critical: [
    /critical/i,
    /emergency/i,
    /actively\s*exploited/i,
    /zero[\s-]?day/i,
    /(?:millions?|billions?)\s*(?:of\s*)?(?:records?|accounts?|users?)/i,
    /(?:hospital|power\s*grid|nuclear|military)/i,
  ],
  high: [
    /high\s*severity/i,
    /major\s*(?:breach|attack|incident)/i,
    /(?:hundreds?\s*of\s*thousands?|thousands?)\s*(?:of\s*)?(?:records?|accounts?)/i,
    /Fortune\s*500/i,
    /federal\s*agency/i,
  ],
  medium: [
    /medium\s*severity/i,
    /moderate/i,
    /(?:thousands?|tens?\s*of\s*thousands?)\s*(?:of\s*)?(?:records?|accounts?)/i,
  ],
  low: [/low\s*severity/i, /minor/i, /contained/i],
  info: [/informational/i, /advisory/i, /heads[\s-]?up/i],
};

const SECTOR_KEYWORDS: Record<Sector, RegExp[]> = {
  healthcare: [/health(?:care|care|system|hospital|clinic)/i, /medical/i, /pharma/i, /biotech/i, /FDA/i],
  finance: [
    /bank(?:ing)?/i,
    /financial/i,
    /credit\s*union/i,
    /insurance/i,
    /fintech/i,
    /crypto(?:currency)?\s*(?:exchange|platform)/i,
  ],
  government: [
    /federal/i,
    /state\s*government/i,
    /municipal/i,
    /agency/i,
    /department\s*of/i,
    /military/i,
    /pentagon/i,
    /doD/i,
  ],
  education: [/university|college|school\s*district|education/i],
  technology: [/tech\s*company|software|SaaS|cloud|hosting|ISP|data\s*center/i],
  retail: [/retail|e[\s-]?commerce|store|shop|merchant/i],
  energy: [/energy|oil|gas|utility|power\s*grid|nuclear/i],
  manufacturing: [/manufacturing|industrial|factory/i],
  telecom: [/telecom|mobile\s*carrier|broadband/i],
  media: [/media|news|broadcast|streaming|entertainment/i],
  transportation: [/airline|railway|shipping|logistics|aviation/i],
  legal: [/law\s*firm|legal/i],
  nonprofit: [/non[\s-]?profit|NGO|foundation/i],
  other: [],
};

// ─── Known threat actors (common groups) ────────────────────────────────────

const KNOWN_ACTORS = [
  'lockbit',
  'blackcat',
  'alphv',
  'cl0p',
  'clop',
  'play',
  'akira',
  'black basta',
  'medusa',
  'hunters',
  'rhysida',
  'monti',
  'INC ransom',
  'embargo',
  'redansom',
  'storm-0978',
  'salt typhoon',
  'scattered spider',
  'lazarus',
  'kimsuky',
  'apt28',
  'apt29',
  'cozy bear',
  'fancy bear',
  'turla',
  'darkhotel',
  'charcoal typhoon',
  'grizzly steppe',
  'iron tiger',
  'winnti',
  'revil',
  'ryuk',
  'conti',
  'darkside',
  'maze',
  'ransomexx',
  'anonymous',
  'ghostsec',
  'killnet',
  'no name',
  'ldz',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(8));
  return `cp_${ts}-${Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

function dedupHash(title: string, victim: string, platform: string): string {
  const norm = `${title}|${victim}|${platform}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Simple hash — not cryptographic, just for dedup
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = ((hash << 5) - hash + norm.charCodeAt(i)) | 0;
  }
  return `dh_${Math.abs(hash).toString(36)}`;
}

function classifyType(text: string): { type: IncidentType; confidence: number } {
  let best: IncidentType = 'other';
  let bestScore = 0;
  for (const [type, patterns] of Object.entries(INCIDENT_PATTERNS) as [IncidentType, RegExp[]][]) {
    let score = 0;
    for (const p of patterns) {
      if (p.test(text)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }
  const confidence = Math.min(0.95, 0.3 + bestScore * 0.2);
  return { type: best, confidence: bestScore > 0 ? confidence : 0.2 };
}

function classifySeverity(text: string): Severity {
  for (const [sev, patterns] of Object.entries(SEVERITY_KEYWORDS) as [Severity, RegExp[]][]) {
    for (const p of patterns) {
      if (p.test(text)) return sev;
    }
  }
  return 'medium';
}

function classifySector(text: string): Sector | null {
  for (const [sector, patterns] of Object.entries(SECTOR_KEYWORDS) as [Sector, RegExp[]][]) {
    for (const p of patterns) {
      if (p.test(text)) return sector;
    }
  }
  return null;
}

function extractThreatActor(text: string): string | null {
  const lower = text.toLowerCase();
  for (const actor of KNOWN_ACTORS) {
    if (lower.includes(actor.toLowerCase())) return actor;
  }
  // Pattern: "Group X claims" or "attributed to Y"
  const m =
    /(?:group|gang|crew|collective|apt|threat\s*actor)\s+(?:named?\s+)?["']?([A-Z][A-Za-z0-9\s-]+?)["']?\s*(?:claims?|hits?|attacks?|responsible)/i.exec(
      text
    );
  return m?.[1]?.trim() ?? null;
}

function extractVictim(text: string): { name: string | null; domain: string | null } {
  // Pattern: "X confirmed/enuffers a breach" or "X data leaked"
  const m =
    /([A-Z][A-Za-z0-9.&\s]{2,40})\s+(?:confirmed|suffered|experienced|hit\s*(?:by|with)|data\s*(?:leak|breach)|breach|compromised|hacked|leaked|attack)/i.exec(
      text
    );
  const name = m?.[1]?.trim() ?? null;
  // Domain extraction
  const dm = /\b([a-z0-9-]+\.[a-z]{2,})\b/i.exec(text);
  return { name, domain: dm?.[1] ?? null };
}

function extractRecordsCount(text: string): number | null {
  const m = /(\d[\d,.]*)\s*(?:million|m)\s*(?:of\s*)?(?:records?|accounts?|users?)/i.exec(text);
  if (m?.[1]) return Math.round(parseFloat(m[1].replace(/,/g, '')) * 1_000_000);
  const m2 = /(\d[\d,.]*)\s*(?:thousand|k)\s*(?:of\s*)?(?:records?|accounts?|users?)/i.exec(text);
  if (m2?.[1]) return Math.round(parseFloat(m2[1].replace(/,/g, '')) * 1_000);
  const m3 = /(\d[\d,]+)\s*(?:records?|accounts?|users?)/i.exec(text);
  if (m3?.[1]) return parseInt(m3[1].replace(/,/g, ''), 10);
  return null;
}

function extractDataVolume(text: string): string | null {
  const m = /(\d[\d.]*)\s*(GB|TB|MB|PB)/i.exec(text);
  return m?.[1] && m?.[2] ? `${m[1]}${m[2].toUpperCase()}` : null;
}

function extractMitres(text: string): string[] {
  const techniques = Array.from(text.matchAll(/T\d{4}(?:\.\d{3})?/g)).map((m) => m[0]);
  return [...new Set(techniques)].slice(0, 10);
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  if (/\bransomware\b/i.test(text)) tags.push('ransomware');
  if (/\bdata\s*leak\b/i.test(text)) tags.push('data-leak');
  if (/\bbreach\b/i.test(text)) tags.push('breach');
  if (/\bphishing\b/i.test(text)) tags.push('phishing');
  if (/\bmalware\b/i.test(text)) tags.push('malware');
  if (/\bzeroday|0[\s-]?day\b/i.test(text)) tags.push('zero-day');
  if (/\bddos\b/i.test(text)) tags.push('ddos');
  if (/\bextort/i.test(text)) tags.push('extortion');
  if (/\binsider\s*threat\b/i.test(text)) tags.push('insider-threat');
  if (/\bsupply\s*chain\b/i.test(text)) tags.push('supply-chain');
  return tags;
}

function classifyIncident(
  text: string,
  _platform: Platform,
  _url: string
): {
  incident_type: IncidentType;
  severity: Severity;
  confidence: number;
  victim_name: string | null;
  victim_domain: string | null;
  victim_sector: Sector | null;
  threat_actor: string | null;
  records_count: number | null;
  data_volume: string | null;
  tags: string[];
  mitre_techniques: string[];
} {
  const { type, confidence } = classifyType(text);
  const severity = classifySeverity(text);
  const { name: victim_name, domain: victim_domain } = extractVictim(text);
  const victim_sector = classifySector(text);
  const threat_actor = extractThreatActor(text);
  const records_count = extractRecordsCount(text);
  const data_volume = extractDataVolume(text);
  const tags = extractTags(text);
  const mitre_techniques = extractMitres(text);

  return {
    incident_type: type,
    severity,
    confidence,
    victim_name,
    victim_domain,
    victim_sector,
    threat_actor,
    records_count,
    data_volume,
    tags,
    mitre_techniques,
  };
}

// ─── Source-specific fetchers ───────────────────────────────────────────────

interface RawPost {
  text: string;
  url: string;
  platform: Platform;
  handle: string;
  author: string;
  avatar: string | null;
  published_at: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
}

/** Fetch recent posts from X accounts via authenticated GraphQL. */
async function fetchXAccountPosts(env: Env, handles: string[], sinceDays: number = 1): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  try {
    readAuthCookies(env);
  } catch {
    return posts; // No X auth configured
  }

  for (const handle of handles) {
    try {
      const resp = await fetchAuthedTimeline(env, handle, {
        count: 20,
        sinceDays,
        includeReplies: false,
      });
      for (const item of resp.items) {
        if (item.is_retweet) continue; // Skip pure retweets
        posts.push({
          text: item.text,
          url: item.url,
          platform: 'x',
          handle,
          author: item.author.name,
          avatar: item.author.avatar_url ?? null,
          published_at: item.created_at,
          likes: item.favorite_count ?? 0,
          retweets: item.retweet_count ?? 0,
          replies: item.reply_count ?? 0,
          views: item.view_count ?? 0,
        });
      }
    } catch (e) {
      if (e instanceof XAuthMissingError) break;
      // Rate-limited or transient — skip this handle
    }
  }
  return posts;
}

/** Search X for breach/leak keywords via authenticated GraphQL. */
async function fetchXSearchPosts(env: Env, queries: string[], count: number = 20): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  try {
    readAuthCookies(env);
  } catch {
    return posts;
  }

  for (const query of queries) {
    try {
      const resp = await fetchSearchTimeline(env, query, {
        count,
        product: 'Latest',
      });
      for (const item of resp.items) {
        if (item.is_retweet) continue;
        posts.push({
          text: item.text,
          url: item.url,
          platform: 'x',
          handle: item.author.screen_name,
          author: item.author.name,
          avatar: item.author.avatar_url ?? null,
          published_at: item.created_at,
          likes: item.favorite_count ?? 0,
          retweets: item.retweet_count ?? 0,
          replies: item.reply_count ?? 0,
          views: item.view_count ?? 0,
        });
      }
    } catch (e) {
      if (e instanceof XAuthMissingError) break;
    }
  }
  return posts;
}

// ─── D1 operations ─────────────────────────────────────────────────────────

async function getExistingDedupHashes(db: D1Database, hoursBack: number = 48): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const { results } = await db
    .prepare('SELECT dedup_hash FROM cyberpulse_incidents WHERE discovered_at > ? AND dedup_hash IS NOT NULL')
    .bind(cutoff)
    .all<{ dedup_hash: string }>();
  return new Set(results.map((r) => r.dedup_hash));
}

async function insertIncidents(db: D1Database, incidents: CyberPulseIncident[]): Promise<number> {
  if (incidents.length === 0) return 0;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cyberpulse_incidents (
      id, incident_type, severity, victim_name, victim_domain, victim_sector,
      victim_country, threat_actor, threat_actor_aliases, title, description,
      data_types_leaked, records_count, data_volume, source_platform, source_url,
      source_handle, source_text, source_author, source_avatar, confidence,
      classification_method, discovered_at, reported_at, updated_at, dedup_hash,
      duplicate_of, tags, mitre_techniques, source_likes, source_retweets,
      source_replies, source_views
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  const batches = [];
  for (const inc of incidents) {
    batches.push(
      stmt.bind(
        inc.id,
        inc.incident_type,
        inc.severity,
        inc.victim_name,
        inc.victim_domain,
        inc.victim_sector,
        inc.victim_country,
        inc.threat_actor,
        inc.threat_actor_aliases,
        inc.title,
        inc.description,
        inc.data_types_leaked,
        inc.records_count,
        inc.data_volume,
        inc.source_platform,
        inc.source_url,
        inc.source_handle,
        inc.source_text,
        inc.source_author,
        inc.source_avatar,
        inc.confidence,
        inc.classification_method,
        inc.discovered_at,
        inc.reported_at,
        inc.updated_at,
        inc.dedup_hash,
        inc.duplicate_of,
        inc.tags,
        inc.mitre_techniques,
        inc.source_likes,
        inc.source_retweets,
        inc.source_replies,
        inc.source_views
      )
    );
  }
  // D1 batch — up to 50 statements per batch
  let inserted = 0;
  for (let i = 0; i < batches.length; i += 50) {
    const batch = batches.slice(i, i + 50);
    const results = await db.batch(batch);
    inserted += results.filter((r) => r.meta?.changes > 0).length;
  }
  return inserted;
}

async function logScan(
  db: D1Database,
  source: string,
  handle: string | null,
  query: string | null,
  itemsFound: number,
  incidentsCreated: number,
  incidentsDeduped: number,
  durationMs: number,
  error: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cyberpulse_scan_log (source, handle, query, scanned_at, items_found, incidents_created, incidents_deduped, duration_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      source,
      handle,
      query,
      new Date().toISOString(),
      itemsFound,
      incidentsCreated,
      incidentsDeduped,
      durationMs,
      error
    )
    .run();
}

// ─── Telegram & social feed converters ──────────────────────────────────────

/** Telegram channels that report breaches/leaks/ransomware. */
const TELEGRAM_BREACH_CHANNELS = new Set([
  'falconfeedsio',
  'RansomLook',
  'secharvester',
  'ctinow',
  'BleepingComputer',
  'TheHackerNews',
  'cyber_security_channel',
  'mythreatintel',
  'vxunderground',
  'IntCyberDigest',
]);

/** Convert a Telegram feed item to a RawPost for classification. */
function telegramItemToRawPost(item: TelegramFeedItem): RawPost | null {
  // Skip channels not relevant to breach/leak tracking
  if (!TELEGRAM_BREACH_CHANNELS.has(item.channel_handle)) return null;
  // Skip very short posts (likely not incident reports)
  if (item.text.length < 40) return null;
  return {
    text: item.text,
    url: item.permalink,
    platform: 'telegram' as Platform,
    handle: item.channel_handle,
    author: item.channel_name,
    avatar: null,
    published_at: item.datetime,
    likes: 0,
    retweets: 0,
    replies: 0,
    views: parseViews(item.views),
  };
}

function parseViews(views?: string): number {
  if (!views) return 0;
  const cleaned = views.replace(/[,.\s]/g, '').toLowerCase();
  if (cleaned.endsWith('k')) return Math.round(parseFloat(cleaned) * 1000);
  if (cleaned.endsWith('m')) return Math.round(parseFloat(cleaned) * 1_000_000);
  return parseInt(cleaned, 10) || 0;
}

/** Convert a Bluesky/Mastodon feed item to a RawPost for classification. */
function xFeedItemToRawPost(item: XFeedItem): RawPost | null {
  // Skip very short posts
  if (item.text.length < 40) return null;
  return {
    text: item.text,
    url: item.link,
    platform: item.platform as Platform,
    handle: item.handle,
    author: item.handle_name,
    avatar: null,
    published_at: item.pub_date,
    likes: 0,
    retweets: 0,
    replies: 0,
    views: 0,
  };
}

/**
 * Fetch Telegram breach/leak feed. When `items` is supplied (reused from the
 * cron's earlier fetch) no new t.me request is made — see CyberPulsePrefetch.
 */
async function fetchTelegramBreachFeed(kv?: KVNamespace, items?: TelegramFeedItem[]): Promise<RawPost[]> {
  try {
    const feedItems = items ?? (await fetchTelegramFeed(kv)).items;
    return feedItems.map(telegramItemToRawPost).filter((p): p is RawPost => p !== null);
  } catch {
    return [];
  }
}

/** Fetch Bluesky/Mastodon social feed. Reuses `items` when supplied. */
async function fetchSocialBreachFeed(items?: XFeedItem[]): Promise<RawPost[]> {
  try {
    const feedItems = items ?? (await fetchXFeed()).items;
    return feedItems.map(xFeedItemToRawPost).filter((p): p is RawPost => p !== null);
  } catch {
    return [];
  }
}

// ─── Main ingestion pipeline ────────────────────────────────────────────────

const X_ACCOUNTS = [
  'FalconFeedsIO',
  'RansomLook',
  'BleepingComputer',
  'TheHackerNews',
  'vxunderground',
  'CyberSecurityKnow',
  'MalwareTechBlog',
  'TalosSecurity',
  'unit42',
  'Mandiant',
  'RecordedFuture',
  'FlashpointIntel',
  'DarkTracer',
  'SOCRadar',
  'GroupIB',
  'intel471',
  'reaborhacks',
  'darkleaks',
  'dnaborhacks',
  'paborhack',
];

const X_SEARCH_QUERIES = [
  '"data breach" (confirmed OR leaked OR exposed)',
  '"ransomware" (claim OR victim OR leak)',
  '"leaked data" OR "data dump" OR "database leak"',
  'extortion (cyber OR data OR breach)',
  'hacktivist (claim OR defaced OR attacked)',
  '"supply chain" attack compromised',
  '0day OR "zero day" exploited',
];

/** Full ingestion pass — called by the hourly cron. */
export async function runCyberPulseIngestion(
  env: Env,
  db: D1Database,
  prefetched: CyberPulsePrefetch = {}
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  const existingHashes = await getExistingDedupHashes(db, 48);
  const now = new Date().toISOString();

  // ── 1. X account monitoring ──────────────────────────────────────────
  const xStart = Date.now();
  try {
    const xPosts = await fetchXAccountPosts(env, X_ACCOUNTS, 1);
    let created = 0;
    let deduped = 0;
    const incidents: CyberPulseIncident[] = [];

    for (const post of xPosts) {
      const classification = classifyIncident(post.text, 'x', post.url);
      // Skip low-confidence posts that aren't breach/leak related
      if (classification.confidence < 0.3 && classification.incident_type === 'other') continue;

      const hash = dedupHash(post.text.slice(0, 200), classification.victim_name ?? '', 'x');
      if (existingHashes.has(hash)) {
        deduped++;
        continue;
      }
      existingHashes.add(hash);

      incidents.push({
        id: generateId(),
        incident_type: classification.incident_type,
        severity: classification.severity,
        victim_name: classification.victim_name,
        victim_domain: classification.victim_domain,
        victim_sector: classification.victim_sector,
        victim_country: null,
        threat_actor: classification.threat_actor,
        threat_actor_aliases: '[]',
        title: post.text.slice(0, 200).replace(/\n/g, ' '),
        description: post.text,
        data_types_leaked: '[]',
        records_count: classification.records_count,
        data_volume: classification.data_volume,
        source_platform: 'x',
        source_url: post.url,
        source_handle: post.handle,
        source_text: post.text,
        source_author: post.author,
        source_avatar: post.avatar,
        confidence: classification.confidence,
        classification_method: 'keyword',
        discovered_at: now,
        reported_at: post.published_at,
        updated_at: now,
        dedup_hash: hash,
        duplicate_of: null,
        tags: JSON.stringify(classification.tags),
        mitre_techniques: JSON.stringify(classification.mitre_techniques),
        source_likes: post.likes,
        source_retweets: post.retweets,
        source_replies: post.replies,
        source_views: post.views,
      });
    }

    const inserted = await insertIncidents(db, incidents);
    created += inserted;
    await logScan(
      db,
      'x_accounts',
      X_ACCOUNTS.join(','),
      null,
      xPosts.length,
      created,
      deduped,
      Date.now() - xStart,
      null
    );
    results.push({
      source: 'x_accounts',
      items_scanned: xPosts.length,
      incidents_created: created,
      incidents_deduped: deduped,
      errors: [],
      duration_ms: Date.now() - xStart,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logScan(db, 'x_accounts', null, null, 0, 0, 0, Date.now() - xStart, err);
    results.push({
      source: 'x_accounts',
      items_scanned: 0,
      incidents_created: 0,
      incidents_deduped: 0,
      errors: [err],
      duration_ms: Date.now() - xStart,
    });
  }

  // ── 2. X keyword search ──────────────────────────────────────────────
  const xSearchStart = Date.now();
  try {
    const xSearchPosts = await fetchXSearchPosts(env, X_SEARCH_QUERIES, 15);
    let created = 0;
    let deduped = 0;
    const incidents: CyberPulseIncident[] = [];

    for (const post of xSearchPosts) {
      const classification = classifyIncident(post.text, 'x', post.url);
      if (classification.confidence < 0.3 && classification.incident_type === 'other') continue;

      const hash = dedupHash(post.text.slice(0, 200), classification.victim_name ?? '', 'x');
      if (existingHashes.has(hash)) {
        deduped++;
        continue;
      }
      existingHashes.add(hash);

      incidents.push({
        id: generateId(),
        incident_type: classification.incident_type,
        severity: classification.severity,
        victim_name: classification.victim_name,
        victim_domain: classification.victim_domain,
        victim_sector: classification.victim_sector,
        victim_country: null,
        threat_actor: classification.threat_actor,
        threat_actor_aliases: '[]',
        title: post.text.slice(0, 200).replace(/\n/g, ' '),
        description: post.text,
        data_types_leaked: '[]',
        records_count: classification.records_count,
        data_volume: classification.data_volume,
        source_platform: 'x',
        source_url: post.url,
        source_handle: post.handle,
        source_text: post.text,
        source_author: post.author,
        source_avatar: post.avatar,
        confidence: classification.confidence,
        classification_method: 'keyword',
        discovered_at: now,
        reported_at: post.published_at,
        updated_at: now,
        dedup_hash: hash,
        duplicate_of: null,
        tags: JSON.stringify(classification.tags),
        mitre_techniques: JSON.stringify(classification.mitre_techniques),
        source_likes: post.likes,
        source_retweets: post.retweets,
        source_replies: post.replies,
        source_views: post.views,
      });
    }

    const inserted = await insertIncidents(db, incidents);
    created += inserted;
    await logScan(
      db,
      'x_search',
      null,
      X_SEARCH_QUERIES.join(' | '),
      xSearchPosts.length,
      created,
      deduped,
      Date.now() - xSearchStart,
      null
    );
    results.push({
      source: 'x_search',
      items_scanned: xSearchPosts.length,
      incidents_created: created,
      incidents_deduped: deduped,
      errors: [],
      duration_ms: Date.now() - xSearchStart,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logScan(db, 'x_search', null, null, 0, 0, 0, Date.now() - xSearchStart, err);
    results.push({
      source: 'x_search',
      items_scanned: 0,
      incidents_created: 0,
      incidents_deduped: 0,
      errors: [err],
      duration_ms: Date.now() - xSearchStart,
    });
  }

  // ── 3. Telegram breach/leak channels ─────────────────────────────────
  const tgStart = Date.now();
  try {
    const tgPosts = await fetchTelegramBreachFeed(env.KV_CACHE, prefetched.telegramItems);
    let created = 0;
    let deduped = 0;
    const incidents: CyberPulseIncident[] = [];

    for (const post of tgPosts) {
      const classification = classifyIncident(post.text, 'telegram', post.url);
      if (classification.confidence < 0.3 && classification.incident_type === 'other') continue;

      const hash = dedupHash(post.text.slice(0, 200), classification.victim_name ?? '', 'telegram');
      if (existingHashes.has(hash)) {
        deduped++;
        continue;
      }
      existingHashes.add(hash);

      incidents.push({
        id: generateId(),
        incident_type: classification.incident_type,
        severity: classification.severity,
        victim_name: classification.victim_name,
        victim_domain: classification.victim_domain,
        victim_sector: classification.victim_sector,
        victim_country: null,
        threat_actor: classification.threat_actor,
        threat_actor_aliases: '[]',
        title: post.text.slice(0, 200).replace(/\n/g, ' '),
        description: post.text,
        data_types_leaked: '[]',
        records_count: classification.records_count,
        data_volume: classification.data_volume,
        source_platform: 'telegram',
        source_url: post.url,
        source_handle: post.handle,
        source_text: post.text,
        source_author: post.author,
        source_avatar: null,
        confidence: classification.confidence,
        classification_method: 'keyword',
        discovered_at: now,
        reported_at: post.published_at,
        updated_at: now,
        dedup_hash: hash,
        duplicate_of: null,
        tags: JSON.stringify(classification.tags),
        mitre_techniques: JSON.stringify(classification.mitre_techniques),
        source_likes: 0,
        source_retweets: 0,
        source_replies: 0,
        source_views: post.views,
      });
    }

    const inserted = await insertIncidents(db, incidents);
    created += inserted;
    await logScan(
      db,
      'telegram',
      TELEGRAM_BREACH_CHANNELS.size + ' channels',
      null,
      tgPosts.length,
      created,
      deduped,
      Date.now() - tgStart,
      null
    );
    results.push({
      source: 'telegram',
      items_scanned: tgPosts.length,
      incidents_created: created,
      incidents_deduped: deduped,
      errors: [],
      duration_ms: Date.now() - tgStart,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logScan(db, 'telegram', null, null, 0, 0, 0, Date.now() - tgStart, err);
    results.push({
      source: 'telegram',
      items_scanned: 0,
      incidents_created: 0,
      incidents_deduped: 0,
      errors: [err],
      duration_ms: Date.now() - tgStart,
    });
  }

  // ── 4. Bluesky + Mastodon social feed ─────────────────────────────────
  const socialStart = Date.now();
  try {
    const socialPosts = await fetchSocialBreachFeed(prefetched.socialItems);
    let created = 0;
    let deduped = 0;
    const incidents: CyberPulseIncident[] = [];

    for (const post of socialPosts) {
      const classification = classifyIncident(post.text, post.platform, post.url);
      if (classification.confidence < 0.3 && classification.incident_type === 'other') continue;

      const hash = dedupHash(post.text.slice(0, 200), classification.victim_name ?? '', post.platform);
      if (existingHashes.has(hash)) {
        deduped++;
        continue;
      }
      existingHashes.add(hash);

      incidents.push({
        id: generateId(),
        incident_type: classification.incident_type,
        severity: classification.severity,
        victim_name: classification.victim_name,
        victim_domain: classification.victim_domain,
        victim_sector: classification.victim_sector,
        victim_country: null,
        threat_actor: classification.threat_actor,
        threat_actor_aliases: '[]',
        title: post.text.slice(0, 200).replace(/\n/g, ' '),
        description: post.text,
        data_types_leaked: '[]',
        records_count: classification.records_count,
        data_volume: classification.data_volume,
        source_platform: post.platform,
        source_url: post.url,
        source_handle: post.handle,
        source_text: post.text,
        source_author: post.author,
        source_avatar: null,
        confidence: classification.confidence,
        classification_method: 'keyword',
        discovered_at: now,
        reported_at: post.published_at,
        updated_at: now,
        dedup_hash: hash,
        duplicate_of: null,
        tags: JSON.stringify(classification.tags),
        mitre_techniques: JSON.stringify(classification.mitre_techniques),
        source_likes: 0,
        source_retweets: 0,
        source_replies: 0,
        source_views: 0,
      });
    }

    const inserted = await insertIncidents(db, incidents);
    created += inserted;
    await logScan(
      db,
      'bluesky_mastodon',
      null,
      null,
      socialPosts.length,
      created,
      deduped,
      Date.now() - socialStart,
      null
    );
    results.push({
      source: 'bluesky_mastodon',
      items_scanned: socialPosts.length,
      incidents_created: created,
      incidents_deduped: deduped,
      errors: [],
      duration_ms: Date.now() - socialStart,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logScan(db, 'bluesky_mastodon', null, null, 0, 0, 0, Date.now() - socialStart, err);
    results.push({
      source: 'bluesky_mastodon',
      items_scanned: 0,
      incidents_created: 0,
      incidents_deduped: 0,
      errors: [err],
      duration_ms: Date.now() - socialStart,
    });
  }

  return results;
}
