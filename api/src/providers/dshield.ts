import type { ProviderAdapter, ProviderResult } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4']);
const API = 'https://isc.sans.edu/api/ip';

/** Per-feed first/last-seen entry under `ip.threatfeeds`. */
interface DShieldFeedEntry {
  firstseen?: string | null;
  lastseen?: string | null;
}

/** Honeypot activity block (`ip.ssh`, `ip.weblogs`). */
interface DShieldHoneypotEntry {
  attempts?: number | null;
  count?: number | null;
  firstseen?: string | null;
  lastseen?: string | null;
}

/**
 * The live ISC/DShield response wraps everything under an `ip` object.
 * `count`/`attacks`/`maxrisk` are frequently `null` even for known-bad IPs
 * (DShield only populates them inside its recent aggregate window), so the
 * durable malicious signal lives in `threatfeeds` and the `ssh`/`weblogs`
 * honeypot blocks. See https://isc.sans.edu/api/.
 */
interface DShieldIp {
  number?: string | null;
  count?: number | null;
  attacks?: number | null;
  mindate?: string | null;
  maxdate?: string | null;
  maxrisk?: number | null;
  as?: number | string | null;
  asname?: string | null;
  ascountry?: string | null;
  network?: string | null;
  comment?: string | null;
  threatfeeds?: Record<string, DShieldFeedEntry> | null;
  ssh?: DShieldHoneypotEntry | null;
  weblogs?: DShieldHoneypotEntry | null;
}

interface DShieldResponse {
  ip?: DShieldIp | null;
}

/**
 * Informational / non-attack threat feeds. Presence in these alone does NOT
 * indicate malice — e.g. 8.8.8.8 (Google DNS) appears in miner/myip/
 * openresolver. Only feeds OUTSIDE this set count toward the score.
 */
const BENIGN_FEEDS = new Set(['miner', 'myip', 'openresolver', 'alexa', 'dnsbl', 'rir']);

/**
 * SANS ISC / DShield — FREE, NO AUTH.
 *
 * Internet Storm Center IP reputation from DShield distributed
 * honeypot sensors. Provides attack count, first/last seen,
 * ASN info, and threat feed status.
 *
 * @see https://isc.sans.edu/api/
 */
export const dshield: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'dshield',
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
    const url = `${API}/${encodeURIComponent(indicator.value)}?json`;
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'threat-intel-platform/1.0', Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const raw = (await res.json()) as DShieldResponse | DShieldResponse[];
    const env: DShieldResponse | undefined = Array.isArray(raw) ? raw[0] : raw;
    // The live response wraps everything under `ip` (an OBJECT, so a string
    // guard on it would misfire). `number` is the canonical IP echo and is
    // null when the IP is unknown to DShield.
    const d = env?.ip;

    if (!d || !d.number) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-listed'],
        raw_summary: { reason: 'IP not found in DShield database' },
      });
    }

    // `count`/`attacks`/`maxrisk` are frequently null even for known-bad IPs
    // (they only reflect DShield's recent aggregate window). Treat null as 0.
    const attackCount = d.attacks ?? d.count ?? 0;
    const maxrisk = d.maxrisk ?? 0;

    // Threat-feed signal. 8.8.8.8 (Google DNS) appears in benign feeds
    // (miner/myip/openresolver), so only feeds OUTSIDE BENIGN_FEEDS count as
    // malicious evidence.
    const feeds = d.threatfeeds ? Object.keys(d.threatfeeds) : [];
    const maliciousFeeds = feeds.filter((f) => !BENIGN_FEEDS.has(f.toLowerCase().replace(/\d+$/, '')));

    // Honeypot evidence: SSH brute-force attempts and abusive web-log hits.
    const sshAttempts = d.ssh?.attempts ?? 0;
    const weblogHits = d.weblogs?.count ?? d.weblogs?.attempts ?? 0;
    const hasHoneypot = sshAttempts > 0 || weblogHits > 0;

    const hasActivity = attackCount > 0 || maxrisk > 0 || maliciousFeeds.length > 0 || hasHoneypot;

    let score = 0;
    if (hasActivity) {
      // Base on recent honeypot attack volume...
      score += attackCount > 0 ? Math.round(Math.log2(attackCount + 1) * 5) : 0;
      // ...DShield's own 0-10 risk rating (scaled)...
      score += maxrisk * 5;
      // ...membership in attack/blocklist feeds (each adds weight, capped)...
      score += Math.min(50, maliciousFeeds.length * 12);
      // ...and direct honeypot brute-force / web-abuse evidence.
      if (sshAttempts > 0) score += Math.min(20, 8 + Math.round(Math.log2(sshAttempts + 1) * 2));
      if (weblogHits > 0) score += Math.min(15, 5 + Math.round(Math.log2(weblogHits + 1) * 2));
      score = Math.min(90, score);
    }

    const tags: string[] = [];
    if (hasActivity) {
      tags.push('dshield-listed');
      if (attackCount > 100) tags.push('high-attacks');
      else if (attackCount > 10) tags.push('medium-attacks');
      if (maliciousFeeds.length > 0) tags.push('threatfeed');
      if (sshAttempts > 0) tags.push('ssh-bruteforce');
      if (weblogHits > 0) tags.push('web-abuse');
    }

    return base('ok', {
      score,
      verdict: score >= 70 ? 'malicious' : score >= 30 ? 'suspicious' : 'clean',
      tags,
      raw_summary: {
        attacks: attackCount,
        max_risk: maxrisk,
        first_seen: d.mindate ?? undefined,
        last_seen: d.maxdate ?? undefined,
        asn: d.as ?? undefined,
        as_name: d.asname ?? undefined,
        country: d.ascountry ?? undefined,
        network: d.network ?? undefined,
        threat_feeds: maliciousFeeds,
        ssh_attempts: sshAttempts,
        weblog_hits: weblogHits,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
