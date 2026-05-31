/**
 * Platform Data Discovery Runner
 *
 * Integrates the platform's own live data sources into the content
 * discovery pipeline. Instead of only using external RSS feeds, this
 * runner mines the platform's cached intelligence for content-worthy
 * events:
 *
 *   1. Ransomware victims from ransomware.live (already cached)
 *   2. Telegram leak channel activity
 *   3. Trending IOCs from the IOC correlation engine
 *   4. High-confidence threat pulse items
 *   5. New detection rules
 *
 * This is the key differentiator from generic RSS-based discovery —
 * the platform's aggregated intelligence surfaces stories that no
 * single RSS feed would catch.
 */

import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

export interface PlatformDataDeps {
  /** Fetch from the platform's own API endpoints (internal, no auth needed). */
  apiFetch: (path: string) => Promise<unknown>;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

// ── Ransomware Victim Discovery ──────────────────────────────────

interface RansomwareVictim {
  group: string;
  victim: string;
  country?: string;
  sector?: string;
  discovered: string;
  url?: string;
}

async function discoverFromRansomware(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = await deps.apiFetch('/api/v1/ransomware-recent') as {
      victims?: RansomwareVictim[];
      count?: number;
    };

    if (!data?.victims?.length) return [];

    const sevenDaysAgo = new Date(deps.now.getTime() - 7 * 24 * 3600 * 1000);
    const groups = new Map<string, { victims: RansomwareVictim[]; latest: Date; sectors: Set<string>; countries: Set<string> }>();

    for (const v of data.victims) {
      if (!v.group || !v.victim) continue;
      const posted = new Date(v.discovered);
      if (posted < sevenDaysAgo) continue;

      const key = `ransom-${v.group.toLowerCase().replace(/\s+/g, '-')}-${posted.toISOString().slice(0, 7)}`;
      const existing = groups.get(key) ?? { victims: [], latest: new Date(0), sectors: new Set(), countries: new Set() };
      existing.victims.push(v);
      if (posted > existing.latest) existing.latest = posted;
      if (v.sector) existing.sectors.add(v.sector);
      if (v.country) existing.countries.add(v.country);
      groups.set(key, existing);
    }

    const candidates: Candidate[] = [];
    for (const [key, info] of groups.entries()) {
      if (info.victims.length < 3) continue; // Need critical mass

      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(info.latest.toISOString(), deps.now),
        severity: severityScore({ victims: info.victims.length }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.95, // High weight — this is our own aggregated data
      });

      const groupName = info.victims[0]!.group;
      const sectorList = [...info.sectors].slice(0, 5);
      const countryList = [...info.countries].slice(0, 5);

      candidates.push({
        key,
        type: 'ransom',
        title: `${groupName}: ${info.victims.length} new victims across ${sectorList.length || 'multiple'} sectors`,
        rationale: `${info.victims.length} victim posts on ransomware leak sites in last 7 days · Sectors: ${sectorList.join(', ') || 'unknown'} · Countries: ${countryList.join(', ') || 'unknown'}`,
        score,
        evidence: {
          group: groupName,
          victimCount: info.victims.length,
          latest: info.latest.toISOString(),
          sectors: sectorList,
          countries: countryList,
          victims: info.victims.slice(0, 30).map(v => ({
            name: v.victim,
            country: v.country,
            sector: v.sector,
            discovered: v.discovered,
          })),
          source: 'platform/ransomware-live',
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }

    return candidates;
  } catch (err) {
    console.warn('discoverFromRansomware failed:', err);
    return [];
  }
}

// ── Telegram Leak Discovery ──────────────────────────────────────

interface TelegramLeak {
  channel_handle: string;
  leak_type: string;
  credential_count: number;
  domains_found: string[];
  severity: string;
  discovered_at: string;
}

async function discoverFromTelegramLeaks(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = await deps.apiFetch('/api/v1/telegram-leaks/stats') as {
      total_leaks?: number;
      recent_leaks?: TelegramLeak[];
      top_domains?: Array<{ domain: string; count: number }>;
    };

    if (!data?.recent_leaks?.length) return [];

    const candidates: Candidate[] = [];
    const twentyFourHoursAgo = new Date(deps.now.getTime() - 24 * 3600 * 1000);

    // Group leaks by channel
    const channelLeaks = new Map<string, { leaks: TelegramLeak[]; totalCreds: number; domains: Set<string> }>();
    for (const leak of data.recent_leaks) {
      const discovered = new Date(leak.discovered_at);
      if (discovered < twentyFourHoursAgo) continue;

      const existing = channelLeaks.get(leak.channel_handle) ?? { leaks: [], totalCreds: 0, domains: new Set() };
      existing.leaks.push(leak);
      existing.totalCreds += leak.credential_count;
      for (const d of leak.domains_found ?? []) existing.domains.add(d);
      channelLeaks.set(leak.channel_handle, existing);
    }

    for (const [channel, info] of channelLeaks.entries()) {
      if (info.leaks.length < 2) continue; // Need multiple leaks to be interesting

      const key = topicKey('telegram-leak', `${channel}-${deps.now.toISOString().slice(0, 10)}`);
      const dedup = await deps.getDedup(key);

      const score = finalScore({
        recency: recencyScore(info.leaks[0]!.discovered_at, deps.now),
        severity: severityScore({ victims: info.totalCreds / 1000 }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.85,
      });

      candidates.push({
        key,
        type: 'breach',
        title: `Telegram leak: ${info.totalCreds} credentials from ${channel}`,
        rationale: `${info.leaks.length} leak events · ${info.totalCreds} credentials · ${info.domains.size} domains affected · Last 24h`,
        score,
        evidence: {
          channel,
          leakCount: info.leaks.length,
          totalCredentials: info.totalCreds,
          domains: [...info.domains].slice(0, 10),
          leakTypes: [...new Set(info.leaks.map(l => l.leak_type))],
          source: 'platform/telegram-leaks',
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }

    return candidates;
  } catch (err) {
    console.warn('discoverFromTelegramLeaks failed:', err);
    return [];
  }
}

// ── Trending IOC Discovery ───────────────────────────────────────

interface TrendingIoc {
  indicator: string;
  type: string;
  count: number;
  sources: string[];
  last_seen: string;
}

async function discoverFromTrendingIocs(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = await deps.apiFetch('/api/v1/ioc-lifecycle/trending?limit=20') as {
      trending?: TrendingIoc[];
    };

    if (!data?.trending?.length) return [];

    const candidates: Candidate[] = [];

    // Group trending IOCs by source cluster
    const sourceClusters = new Map<string, { iocs: TrendingIoc[]; totalScore: number }>();
    for (const ioc of data.trending) {
      if (ioc.count < 5) continue; // Need significant activity

      const key = topicKey('trending-ioc', `${ioc.type}-${ioc.indicator.slice(0, 20)}`);
      const dedup = await deps.getDedup(key);

      const score = finalScore({
        recency: recencyScore(ioc.last_seen, deps.now),
        severity: severityScore({ victims: ioc.count / 10 }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.8,
      });

      // Only surface high-activity IOCs
      if (score < 0.5) continue;

      candidates.push({
        key,
        type: 'intel',
        title: `Trending ${ioc.type}: ${ioc.indicator} seen ${ioc.count} times`,
        rationale: `Active IOC across ${ioc.sources.length} sources in last 24h · ${ioc.count} observations`,
        score,
        evidence: {
          indicator: ioc.indicator,
          indicatorType: ioc.type,
          observationCount: ioc.count,
          sources: ioc.sources,
          lastSeen: ioc.last_seen,
          source: 'platform/ioc-lifecycle',
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }

    return candidates;
  } catch (err) {
    console.warn('discoverFromTrendingIocs failed:', err);
    return [];
  }
}

// ── Threat Pulse Discovery ───────────────────────────────────────

interface ThreatPulseItem {
  entity: string;
  type: string;
  mentions: number;
  sources: string[];
  latest: string;
}

async function discoverFromThreatPulse(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = await deps.apiFetch('/api/v1/threat-pulse') as {
      actors?: ThreatPulseItem[];
      malware?: ThreatPulseItem[];
      cves?: ThreatPulseItem[];
    };

    const candidates: Candidate[] = [];
    const twentyFourHoursAgo = new Date(deps.now.getTime() - 24 * 3600 * 1000);

    // Process actors
    for (const actor of data.actors ?? []) {
      if (actor.mentions < 3) continue;
      const latest = new Date(actor.latest);
      if (latest < twentyFourHoursAgo) continue;

      const key = topicKey('pulse-actor', actor.entity.toLowerCase());
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(actor.latest, deps.now),
        severity: severityScore({ victims: actor.mentions }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.9,
      });

      if (score < 0.6) continue;

      candidates.push({
        key,
        type: 'actor',
        title: `${actor.entity}: trending across ${actor.mentions} sources`,
        rationale: `Mentioned ${actor.mentions} times in last 24h · Sources: ${actor.sources.slice(0, 3).join(', ')}`,
        score,
        evidence: {
          entity: actor.entity,
          mentions: actor.mentions,
          sources: actor.sources,
          latest: actor.latest,
          source: 'platform/threat-pulse',
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }

    // Process malware
    for (const malware of data.malware ?? []) {
      if (malware.mentions < 3) continue;
      const latest = new Date(malware.latest);
      if (latest < twentyFourHoursAgo) continue;

      const key = topicKey('pulse-malware', malware.entity.toLowerCase());
      const dedup = await deps.getDedup(key);
      const score = finalScore({
        recency: recencyScore(malware.latest, deps.now),
        severity: severityScore({ victims: malware.mentions }),
        novelty: noveltyScore(dedup, deps.now),
        sourceWeight: 0.9,
      });

      if (score < 0.6) continue;

      candidates.push({
        key,
        type: 'malware',
        title: `${malware.entity}: active across ${malware.mentions} intel sources`,
        rationale: `Mentioned ${malware.mentions} times in last 24h · Sources: ${malware.sources.slice(0, 3).join(', ')}`,
        score,
        evidence: {
          entity: malware.entity,
          mentions: malware.mentions,
          sources: malware.sources,
          latest: malware.latest,
          source: 'platform/threat-pulse',
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }

    return candidates;
  } catch (err) {
    console.warn('discoverFromThreatPulse failed:', err);
    return [];
  }
}

// ── Main Runner ──────────────────────────────────────────────────

/**
 * Run all platform-data discovery sources in parallel.
 * Returns candidates from the platform's own aggregated intelligence.
 */
export async function discoverFromPlatformData(deps: PlatformDataDeps): Promise<Candidate[]> {
  const [ransomware, telegramLeaks, trendingIocs, threatPulse] = await Promise.allSettled([
    discoverFromRansomware(deps),
    discoverFromTelegramLeaks(deps),
    discoverFromTrendingIocs(deps),
    discoverFromThreatPulse(deps),
  ]);

  const candidates: Candidate[] = [];

  if (ransomware.status === 'fulfilled') candidates.push(...ransomware.value);
  if (telegramLeaks.status === 'fulfilled') candidates.push(...telegramLeaks.value);
  if (trendingIocs.status === 'fulfilled') candidates.push(...trendingIocs.value);
  if (threatPulse.status === 'fulfilled') candidates.push(...threatPulse.value);

  console.log(JSON.stringify({
    runner: 'platform-data',
    ransomware: ransomware.status === 'fulfilled' ? ransomware.value.length : 'failed',
    telegramLeaks: telegramLeaks.status === 'fulfilled' ? telegramLeaks.value.length : 'failed',
    trendingIocs: trendingIocs.status === 'fulfilled' ? trendingIocs.value.length : 'failed',
    threatPulse: threatPulse.status === 'fulfilled' ? threatPulse.value.length : 'failed',
    total: candidates.length,
  }));

  return candidates;
}
