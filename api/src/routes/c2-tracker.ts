import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Free C2 infrastructure feeds.
 *
 * Source priority for dedup: threatfox > c2intel (30d > 90d)
 */

// C2IntelFeeds — IP + port + C2 framework context. 30d is more actionable.
const C2INTEL_30D = 'https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPPortC2s-30day.csv';
const C2INTEL_90D = 'https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPPortC2s-90day.csv';

// ThreatFox — any ip:port entry is a live C2 indicator.
const THREATFOX_CSV = 'https://threatfox.abuse.ch/export/csv/recent/';

const CACHE_TTL = 1800;
const FETCH_TIMEOUT = 12_000;

export interface C2Entry {
  ip: string;
  framework: string;
  first_seen: string;
  /** Source feed identifier: 'c2intel' | 'threatfox' */
  source: string;
  /** Malware family or C2 framework context string. */
  context?: string;
  port?: number;
}

export interface C2Response {
  generated_at: string;
  count: number;
  /** Per-source counts. */
  sources: { id: string; name: string; count: number }[];
  /** Per-framework (source-derived) counts. */
  frameworks: Record<string, number>;
  entries: C2Entry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: '*/*' },
      cf: { cacheTtl: 1500, cacheEverything: true },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Map C2IntelFeeds IOC strings to short framework labels. */
function deriveFramework(ioc: string): string {
  const lower = ioc.toLowerCase();
  if (lower.includes('cobalt')) return 'cobaltstrike';
  if (lower.includes('sliver')) return 'sliver';
  if (lower.includes('metasploit') || lower.includes('meterpreter')) return 'metasploit';
  if (lower.includes('havoc')) return 'havoc';
  if (lower.includes('brute ratel') || lower.includes('bruteratel')) return 'bruteratel';
  if (lower.includes('nighthawk')) return 'nighthawk';
  if (lower.includes('deimos')) return 'deimos';
  if (lower.includes('poshc2')) return 'poshc2';
  if (lower.includes('empire')) return 'empire';
  if (lower.includes('mythic')) return 'mythic';
  if (lower.includes('pwnrig')) return 'pwnrig';
  if (lower.includes('covenant')) return 'covenant';
  if (lower.includes('adaptix')) return 'adaptix';
  if (lower.includes('quasar')) return 'quasar';
  if (lower.includes('vshell')) return 'vshell';
  return 'unknown';
}

/** Map ThreatFox malware family (from fk_malware) to a short framework label. */
function threatfoxFramework(malware: string): string {
  const lower = malware.toLowerCase().replace(/\s+/g, '');
  if (lower.includes('cobalt_strike') || lower.includes('cobaltstrike')) return 'cobaltstrike';
  if (lower.includes('sliver')) return 'sliver';
  if (lower.includes('meterpreter')) return 'metasploit';
  if (lower.includes('havoc')) return 'havoc';
  if (lower.includes('brute') && lower.includes('ratel')) return 'bruteratel';
  if (lower.includes('vshell')) return 'vshell';
  if (lower.includes('asyncrat')) return 'asyncrat';
  if (lower.includes('remcos')) return 'remcos';
  if (lower.includes('dcrat')) return 'dcrat';
  if (lower.includes('quasar')) return 'quasar';
  if (lower.includes('adaptix')) return 'adaptix';
  // Generic: use the malware family name as the framework label
  const cleaned = lower.replace(/^(win|apk|elf|js)\./, '');
  if (cleaned && cleaned !== 'unknown') return cleaned;
  return 'unknown';
}

// ─── C2IntelFeeds parsers ───────────────────────────────────────────────────

/** Parse C2IntelFeeds IPPortC2s CSV. Columns (no header row): ip,port,ioc */
function parseC2Intels(body: string, sourceLabel: string): C2Entry[] {
  const entries: C2Entry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const cols = trimmed.split(',');
    if (cols.length < 2) continue;
    const ip = cols[0]?.trim();
    if (!ip || !IPV4_RE.test(ip)) continue;
    const port = parseInt(cols[1] ?? '', 10);
    const ioc = cols.length >= 3 ? cols.slice(2).join(',').trim() : '';
    const fw = deriveFramework(ioc);
    entries.push({
      ip,
      framework: fw,
      first_seen: '',
      source: sourceLabel,
      context: ioc || undefined,
      port: isFinite(port) ? port : undefined,
    });
  }
  return entries;
}

// ─── ThreatFox parser — all ip:port entries are C2 indicators ──────────────

function parseThreatfoxC2(body: string): C2Entry[] {
  const entries: C2Entry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Naive split by comma — ThreatFox CSV uses quoted fields but the first 8
    // columns (our range of interest) don't contain embedded commas. The tags
    // column (index 12+) can have commas but we don't read past index 7.
    const cols = trimmed.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 6) continue;
    const iocType = cols[3] ?? '';
    if (iocType !== 'ip:port') continue;
    const rawValue = cols[2] ?? '';
    const colon = rawValue.lastIndexOf(':');
    const ip = colon === -1 ? rawValue : rawValue.slice(0, colon);
    if (!ip || !IPV4_RE.test(ip)) continue;
    const port = colon === -1 ? undefined : parseInt(rawValue.slice(colon + 1), 10);
    const malware = cols[5]?.trim() || '';
    const printable = cols[7]?.trim() || '';
    const context = printable || malware || 'C2';
    const firstSeen = cols[0]?.trim() || '';
    entries.push({
      ip,
      framework: malware ? threatfoxFramework(malware) : 'unknown',
      first_seen: firstSeen,
      source: 'threatfox',
      context: context,
      port: port !== undefined && isFinite(port) ? port : undefined,
    });
  }
  return entries;
}

// ─── Main fetch ─────────────────────────────────────────────────────────────

async function fetchC2Tracker(): Promise<C2Response> {
  const rawTexts = await Promise.all([fetchText(C2INTEL_30D), fetchText(C2INTEL_90D), fetchText(THREATFOX_CSV)]);

  const sourceEntries: { id: string; name: string; entries: C2Entry[] }[] = [
    { id: 'c2intel-30d', name: 'C2Intel (30d)', entries: rawTexts[0] ? parseC2Intels(rawTexts[0], 'c2intel') : [] },
    { id: 'c2intel-90d', name: 'C2Intel (90d)', entries: rawTexts[1] ? parseC2Intels(rawTexts[1], 'c2intel') : [] },
    { id: 'threatfox', name: 'ThreatFox', entries: rawTexts[2] ? parseThreatfoxC2(rawTexts[2]) : [] },
  ];

  // Dedup by IP with source priority: threatfox > c2intel
  // For c2intel, more recent feeds override older ones (30d > 90d)
  const sourcePriority: Record<string, number> = {
    threatfox: 10,
    c2intel: 5,
  };

  const seen = new Map<string, C2Entry>();
  for (const { id, entries } of sourceEntries) {
    // Inherit base priority from feed id (strip -30d/-90d suffix)
    const baseId = id.includes('c2intel') ? 'c2intel' : id;
    for (const e of entries) {
      const existing = seen.get(e.ip);
      if (!existing) {
        seen.set(e.ip, e);
      } else {
        const existingId = existing.source === 'c2intel' ? 'c2intel' : existing.source;
        if ((sourcePriority[existingId] ?? 0) < (sourcePriority[baseId] ?? 0)) {
          seen.set(e.ip, e);
        }
      }
    }
  }

  const merged = [...seen.values()];

  // Build per-source summary (group c2intel-30d/90d together)
  const c2intelCount = merged.filter((e) => e.source === 'c2intel').length;
  const threatfoxCount = merged.filter((e) => e.source === 'threatfox').length;
  const sourceSummary = [
    { id: 'c2intel', name: 'C2IntelFeeds', count: c2intelCount },
    ...(threatfoxCount > 0 ? [{ id: 'threatfox', name: 'ThreatFox', count: threatfoxCount }] : []),
  ];

  // Build framework counts from deduped entries
  const frameworkCounts: Record<string, number> = {};
  for (const e of merged) {
    frameworkCounts[e.framework] = (frameworkCounts[e.framework] ?? 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    count: merged.length,
    sources: sourceSummary,
    frameworks: frameworkCounts,
    entries: merged.slice(0, 500),
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function c2TrackerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://c2-cache.internal/v4');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const data = await fetchC2Tracker();
  const body = JSON.stringify(data);

  const response = new Response(body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL}`,
      'access-control-allow-origin': '*',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
