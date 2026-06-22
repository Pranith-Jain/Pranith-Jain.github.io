/**
 * Platform Data Discovery Runner
 *
 * Integrates the platform's own live data sources into the content
 * discovery pipeline. Instead of only using external RSS feeds, this
 * runner mines the platform's cached intelligence for content-worthy
 * events:
 *
 *   1. Telegram leak channel activity
 *   2. Trending IOCs from the IOC correlation engine
 *   3. High-confidence threat pulse items
 *
 * NOTE: Ransomware victim discovery is intentionally EXCLUDED here.
 * The dedicated `ransom` runner (always-on) already covers ransomware
 * victims from the same upstream sources (ransomlook.io via
 * ransom-source.ts). Running it here too would process the same data
 * through different normalization/dedup key patterns, producing
 * duplicate case studies for the same activity.
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

// ── Telegram Leak Discovery ──────────────────────────────────────

interface TelegramLeak {
  channel_handle: string;
  leak_type: string;
  credential_count: number;
  domains_found: string[];
  severity: string;
  discovered_at: string;
}

export async function discoverFromTelegramLeaks(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = (await deps.apiFetch('/api/v1/telegram-leaks/stats')) as {
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

      // Use stable key without date - suppression window handles freshness
      const key = topicKey('telegram-leak', channel);
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
          leakTypes: [...new Set(info.leaks.map((l) => l.leak_type))],
          source: 'platform/telegram-leaks',
        },
        discoveredAt: deps.now.toISOString(),
        status: 'pending',
      });
    }

    console.log(JSON.stringify({ runner: 'platform-telegram', candidates: candidates.length }));
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

export async function discoverFromTrendingIocs(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = (await deps.apiFetch('/api/v1/ioc-lifecycle/trending?limit=20')) as {
      trending?: TrendingIoc[];
    };

    if (!data?.trending?.length) return [];

    const candidates: Candidate[] = [];

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

    console.log(JSON.stringify({ runner: 'platform-iocs', candidates: candidates.length }));
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

export async function discoverFromThreatPulse(deps: PlatformDataDeps): Promise<Candidate[]> {
  try {
    const data = (await deps.apiFetch('/api/v1/threat-pulse')) as {
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

    console.log(JSON.stringify({ runner: 'platform-pulse', candidates: candidates.length }));
    return candidates;
  } catch (err) {
    console.warn('discoverFromThreatPulse failed:', err);
    return [];
  }
}
