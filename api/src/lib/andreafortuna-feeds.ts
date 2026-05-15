import type { CybercrimeItem } from '../routes/cybercrime';
import type { LiveIoc } from '../routes/live-iocs';

const DATAMARKETS_URL = 'https://ctifeeds.andreafortuna.org/datamarkets.json';
const DEFACEMENTS_URL = 'https://ctifeeds.andreafortuna.org/recent_defacements.json';
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
