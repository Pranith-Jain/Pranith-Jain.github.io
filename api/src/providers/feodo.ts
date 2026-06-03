import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * Feodo Tracker (abuse.ch) — FREE, NO AUTH.
 *
 * Tracks botnet Command & Control (C2) servers. Covers:
 *   - Dridex C2 servers
 *   - Emotet C2 servers
 *   - TrickBot C2 servers
 *   - QakBot C2 servers
 *   - BazarLoader C2 servers
 *
 * Provides IP blocklists in multiple formats (JSON, CSV, text).
 * No authentication required. Updated every 5 minutes.
 *
 * @see https://feodotracker.abuse.ch/
 */

const supports = new Set(['ipv4', 'ipv6']);

interface FeodoEntry {
  // Upstream JSON field is `ip_address` — the old `ip` was always undefined, so
  // the lookup map keyed everything under `undefined` and EVERY C2 IP came back
  // "clean" (a high-confidence botnet-C2 feed producing zero signal).
  ip_address: string;
  port: number;
  hostname: string;
  malware: string;
  first_seen: string;
  last_online: string;
  status: string;
}

/** Cache the blocklist for 30 minutes */
let cachedList: Map<string, FeodoEntry> | null = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function getFeodoList(signal: AbortSignal): Promise<Map<string, FeodoEntry>> {
  const now = Date.now();
  if (cachedList && now - cacheTime < CACHE_TTL) {
    return cachedList;
  }

  const res = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', {
    signal,
    headers: { 'User-Agent': 'threat-intel-platform/1.0' },
  });

  if (!res.ok) throw new Error(`Feodo API error: ${res.status}`);

  const entries = (await res.json()) as FeodoEntry[];
  const map = new Map<string, FeodoEntry>();

  for (const entry of entries) {
    map.set(entry.ip_address, entry);
  }

  cachedList = map;
  cacheTime = now;
  return map;
}

export const feodo: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'feodo',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  try {
    const list = await getFeodoList(signal);
    const entry = list.get(indicator.value);

    if (!entry) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-listed'],
        raw_summary: { reason: 'IP not in Feodo Tracker C2 blocklist' },
      });
    }

    // C2 servers are high confidence malicious
    const score = 95;
    const verdict: Verdict = 'malicious';

    const tags: string[] = ['botnet-c2'];
    if (entry.malware) tags.push(`malware:${entry.malware}`);
    if (entry.status) tags.push(`status:${entry.status}`);
    if (entry.port) tags.push(`port:${entry.port}`);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 6),
      raw_summary: {
        ip: entry.ip_address,
        port: entry.port,
        hostname: entry.hostname,
        malware: entry.malware,
        first_seen: entry.first_seen,
        last_online: entry.last_online,
        status: entry.status,
        source: 'Feodo Tracker (abuse.ch)',
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
