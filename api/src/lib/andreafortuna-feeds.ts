import type { CybercrimeItem } from '../routes/cybercrime';
import type { LiveIoc } from '../routes/live-iocs';
import type { RansomwareVictim } from '../routes/ransomware-recent';
import type { BreachDisclosure } from '../routes/breach-disclosures';
import { classifySector } from './sector-classifier';

const DATAMARKETS_URL = 'https://ctifeeds.andreafortuna.org/datamarkets.json';
const DEFACEMENTS_URL = 'https://ctifeeds.andreafortuna.org/recent_defacements.json';
const RANSOMWARE_VICTIMS_URL = 'https://ctifeeds.andreafortuna.org/ransomware_victims.json';
const DATALEAKS_URL = 'https://ctifeeds.andreafortuna.org/dataleaks.json';
const FETCH_TIMEOUT_MS = 12_000;

export const MAX_ITEMS_PER_FEED = 200;

/**
 * Raw entry shape served by the Andrea Fortuna CTI feeds. The same shape is
 * used for every feed; `urlscan` is only present on datamarkets/dataleaks.
 *
 * See: https://ctifeeds.andreafortuna.org/
 */
export interface AFEntry {
  url: string;
  name: string;
  source: string;
  screenshot?: string;
  status?: string;
  timestamp: string;
  urlscan?: string;
  id?: string;
}

/**
 * AF timestamps look like "2026-05-15T02:08:01.440399" — ISO-ish but
 * (a) microsecond precision (JS only handles ms) and (b) no timezone offset.
 * Treat as UTC and truncate to milliseconds.
 */
export function toIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined;
  // Trim sub-millisecond digits, append Z.
  const trimmed = ts.replace(/(\.\d{3})\d+$/, '$1');
  const withZ = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const t = Date.parse(withZ);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString();
}

export function parseDatamarkets(entries: AFEntry[]): CybercrimeItem[] {
  const out: CybercrimeItem[] = [];
  for (const e of entries) {
    if (!e.url || !e.name) continue;
    const published = toIso(e.timestamp);
    out.push({
      title: e.name,
      url: e.url,
      source: 'andreafortuna-demonforums',
      category: 'underground-forums',
      published,
      description: 'Underground forum thread',
      tags: [e.source, 'credentials', 'forum'].filter(Boolean),
    });
    if (out.length >= MAX_ITEMS_PER_FEED) break;
  }
  return out;
}

export function parseDefacements(entries: AFEntry[]): LiveIoc[] {
  const out: LiveIoc[] = [];
  for (const e of entries) {
    if (!e.url) continue;
    out.push({
      value: e.url,
      kind: 'url',
      source: 'andreafortuna-defacements',
      reporter: 'hax.or',
      context: 'website defacement',
      observed_at: toIso(e.timestamp),
    });
    if (out.length >= MAX_ITEMS_PER_FEED) break;
  }
  return out;
}

async function fetchJson(url: string): Promise<AFEntry[] | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'pranithjain-dfir/1.0',
        accept: 'application/json',
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    const body = await res.json();
    if (!Array.isArray(body)) return null;
    return body as AFEntry[];
  } catch {
    return null;
  }
}

export async function fetchAFDatamarkets(): Promise<CybercrimeItem[]> {
  const raw = await fetchJson(DATAMARKETS_URL);
  if (!raw) return [];
  return parseDatamarkets(raw);
}

export async function fetchAFDefacements(): Promise<LiveIoc[]> {
  const raw = await fetchJson(DEFACEMENTS_URL);
  if (!raw) return [];
  return parseDefacements(raw);
}

/**
 * AF ransomware-victim `name` is "<Group>: <Victim> - <description>".
 * The description segment is optional ("Loki: Credit Freedom & Restoration").
 * Group is lowercased to match the convention in ransomware-recent.ts.
 *
 * The caller passes a `cutoffMs` so the fetcher can apply a 7-day window
 * (matching the other merge sources) without baking Date.now() into the
 * parser — tests use fixed historical data and would otherwise fail.
 * Pass `0` to disable the cutoff.
 */
export function parseAFRansomwareVictims(entries: AFEntry[], cutoffMs = 0): RansomwareVictim[] {
  const out: RansomwareVictim[] = [];
  for (const e of entries) {
    if (!e.name) continue;
    const colon = e.name.indexOf(': ');
    const group = colon > 0 ? e.name.slice(0, colon).trim() : (e.source || 'unknown').trim();
    const rest = colon > 0 ? e.name.slice(colon + 2) : e.name;
    const dash = rest.indexOf(' - ');
    const victim = (dash > 0 ? rest.slice(0, dash) : rest).trim();
    const description = dash > 0 ? rest.slice(dash + 3).trim() || undefined : undefined;
    if (!victim || !group) continue;
    const iso = toIso(e.timestamp);
    if (iso) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t) || (cutoffMs > 0 && t < cutoffMs)) continue;
    } else if (cutoffMs > 0) {
      // No parseable timestamp — skip when a cutoff is in effect, since we
      // can't confirm freshness. Every other source supplies a real date;
      // surfacing undated rows would create the same "today = 200+"
      // inflation we just fixed.
      continue;
    }
    out.push({
      victim,
      group: group.toLowerCase(),
      // Fall back to the raw timestamp when the parser can't normalize it,
      // so callers that pass cutoffMs = 0 (tests, one-off parsers) still
      // see a discovered value. The fetcher never hits this path because
      // it sets a cutoff that drops undated rows.
      discovered: iso ?? e.timestamp,
      description,
      source_url: e.url || 'https://ctifeeds.andreafortuna.org/',
      screen_url: e.screenshot || undefined,
      sector: classifySector(victim, description),
      origin: 'andreafortuna',
    });
    if (out.length >= MAX_ITEMS_PER_FEED) break;
  }
  return out;
}

/**
 * AF dataleak `name` is "Have i been pwned? - <Title> - <N> breached accounts".
 * `url` is https://haveibeenpwned.com/Breach/<Slug> — the slug is HIBP's
 * canonical Name, used as the dedupe key against the primary HIBP source.
 */
export function parseAFDataleaks(entries: AFEntry[]): BreachDisclosure[] {
  const out: BreachDisclosure[] = [];
  for (const e of entries) {
    if (!e.name) continue;
    const s = e.name.replace(/^Have i been pwned\?\s*-\s*/i, '').trim();
    const dash = s.indexOf(' - ');
    const title = (dash > 0 ? s.slice(0, dash) : s).trim();
    const tail = dash > 0 ? s.slice(dash + 3) : '';
    const m = tail.match(/([\d,]+)\s+breached/i);
    const pwn_count = m ? Number(m[1]!.replace(/,/g, '')) : undefined;
    const slug = (e.url.split('/').pop() || title).trim();
    if (!title) continue;
    out.push({
      name: slug,
      title,
      pwn_count: Number.isFinite(pwn_count) ? pwn_count : undefined,
      added_date: toIso(e.timestamp),
      verified: false,
      sensitive: false,
      origin: 'andreafortuna',
    });
    if (out.length >= MAX_ITEMS_PER_FEED) break;
  }
  return out;
}

export async function fetchAFRansomwareVictims(): Promise<RansomwareVictim[]> {
  const raw = await fetchJson(RANSOMWARE_VICTIMS_URL);
  if (!raw) return [];
  // 7-day cutoff matching the other fetchers in the ransomware-recent
  // merge. AF's `timestamp` field is the upstream publication date;
  // without a cutoff, months-old claims can leak into the metrics page
  // (same root cause as the ransomfeed unparseable-date issue).
  const cutoffMs = Date.now() - 7 * 24 * 3600 * 1000;
  return parseAFRansomwareVictims(raw, cutoffMs);
}

export async function fetchAFDataleaks(): Promise<BreachDisclosure[]> {
  const raw = await fetchJson(DATALEAKS_URL);
  if (!raw) return [];
  return parseAFDataleaks(raw);
}
