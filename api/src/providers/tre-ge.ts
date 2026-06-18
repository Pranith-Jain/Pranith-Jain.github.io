import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyThrownError, toProviderError } from '../lib/provider-errors';

/**
 * tre.ge — Threat Reputation Engine (Georgia).
 *
 * Aggregated reputation lookup for IPs, domains, URLs, and file hashes.
 * Free public tier (no key required) — returns a JSON envelope with the
 * indicator's reputation, abuse score, geo/ASN, and any associated
 * reports referenced in their catalogue.
 *
 * Endpoint:  https://api.tre.ge/lookup/{type}/{value}
 *   type ∈ {ip, domain, url, hash}
 *
 * Response shape (subset — fields omitted by tre.ge are just absent):
 *   {
 *     "indicator": "1.2.3.4",
 *     "type": "ip",
 *     "reputation": "malicious" | "suspicious" | "clean" | "unknown",
 *     "score": 0-100,
 *     "asn": "AS12345 Example Inc",
 *     "country": "US",
 *     "sources": [
 *       { "name": "abuse.ch", "verdict": "malicious", "reference": "..." },
 *       ...
 *     ],
 *     "tags": ["c2", "botnet", ...],
 *     "first_seen": "2024-01-15T00:00:00Z",
 *     "last_seen": "2025-06-01T00:00:00Z"
 *   }
 *
 * The endpoint is rate-limited (~5 req/min from one IP without a key).
 * We use the platform's free tier and add a 6 s timeout.
 */

const supports = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

function mapIndicatorType(t: string): string {
  if (t === 'ipv4' || t === 'ipv6') return 'ip';
  if (t === 'hash') return 'hash';
  return t;
}

interface TreGeSource {
  name?: string;
  verdict?: string;
  reference?: string;
}

interface TreGeResponse {
  indicator?: string;
  type?: string;
  reputation?: 'malicious' | 'suspicious' | 'clean' | 'unknown' | string;
  score?: number;
  asn?: string;
  country?: string;
  sources?: TreGeSource[];
  tags?: string[];
  first_seen?: string;
  last_seen?: string;
}

function mapVerdict(rep: string | undefined, score: number | undefined): Verdict {
  if (rep === 'malicious') return 'malicious';
  if (rep === 'suspicious') return 'suspicious';
  if (rep === 'clean' || rep === 'whitelisted') return 'clean';
  if (typeof score === 'number') {
    if (score >= 75) return 'malicious';
    if (score >= 40) return 'suspicious';
    if (score <= 10) return 'clean';
  }
  return 'unknown';
}

export const trege: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'tre-ge',
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
    const pathType = mapIndicatorType(indicator.type);
    const url = `https://api.tre.ge/lookup/${pathType}/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 404) {
      return base('ok', {
        verdict: 'unknown',
        raw_summary: { reputation: 'unknown' },
        tags: ['no-record'],
      });
    }
    if (res.status === 429) {
      return base('error', { error: 'rate-limited' });
    }
    if (!res.ok) {
      return base('error', { error: `upstream ${res.status}` });
    }

    const data = (await res.json()) as TreGeResponse;
    const verdict = mapVerdict(data.reputation, data.score);
    const score =
      typeof data.score === 'number'
        ? Math.max(0, Math.min(100, data.score))
        : verdict === 'malicious'
          ? 85
          : verdict === 'suspicious'
            ? 50
            : verdict === 'clean'
              ? 5
              : 15;

    const tags: string[] = [];
    if (Array.isArray(data.tags)) tags.push(...data.tags.map((t) => `trege:${t}`));
    if (verdict === 'malicious') tags.push('trege:malicious');
    if (verdict === 'suspicious') tags.push('trege:suspicious');

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        indicator: data.indicator ?? indicator.value,
        reputation: data.reputation ?? 'unknown',
        asn: data.asn ?? null,
        country: data.country ?? null,
        sources: Array.isArray(data.sources) ? data.sources : [],
        first_seen: data.first_seen ?? null,
        last_seen: data.last_seen ?? null,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
