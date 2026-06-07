import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const SUPPORTED_TYPES = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash']);

interface MaltiverseHit {
  _source?: {
    classification?: string;
    blacklist?: Array<{
      description?: string;
      source?: string;
      labels?: string[];
    }>;
    tag?: string[];
    type?: string;
    ip_addr?: string;
    hostname?: string;
    domain?: string;
    url?: string;
    sha256?: string;
    md5?: string;
    sha1?: string;
  };
}

interface MaltiverseSearchResponse {
  hits?: {
    hits?: MaltiverseHit[];
    total?: { value?: number };
  };
}

/**
 * Map Maltiverse classification to a score + verdict.
 *
 * Maltiverse uses: whitelist, blacklist, greylist, malicious, suspicious.
 * "blacklist" and "malicious" are treated equivalently.
 */
function classificationToScore(classification: string, blacklistCount: number): { score: number; verdict: Verdict } {
  switch (classification) {
    case 'blacklist':
    case 'malicious':
      return { score: Math.min(100, 60 + blacklistCount * 5), verdict: 'malicious' };
    case 'suspicious':
      return { score: Math.min(80, 40 + blacklistCount * 5), verdict: 'suspicious' };
    case 'greylist':
      return { score: 20, verdict: 'suspicious' };
    case 'whitelist':
      return { score: 0, verdict: 'clean' };
    default:
      return { score: 0, verdict: 'unknown' };
  }
}

/**
 * Check whether a Maltiverse hit is an exact match for the requested IOC.
 * The search endpoint is fuzzy — it returns partial and substring matches,
 * so we must verify the hit actually describes the indicator we asked about.
 */
function isExactMatch(hit: MaltiverseHit, type: string, value: string): boolean {
  const src = hit._source;
  if (!src) return false;
  const v = value.toLowerCase();
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return src.ip_addr?.toLowerCase() === v;
    case 'domain':
      return src.hostname?.toLowerCase() === v || src.domain?.toLowerCase() === v;
    case 'url':
      return src.url?.toLowerCase() === v;
    case 'hash':
      return src.sha256?.toLowerCase() === v || src.md5?.toLowerCase() === v || src.sha1?.toLowerCase() === v;
    default:
      return false;
  }
}

export const maltiverse: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'maltiverse',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!SUPPORTED_TYPES.has(indicator.type)) return base('unsupported');

  try {
    // The search endpoint is the only reliable path — the direct /ip/{ip} etc.
    // endpoints return 404 for unknown IOCs (no clean negative), while search
    // returns an empty hits array. We filter for exact matches client-side.
    const url = `https://api.maltiverse.com/search?query=${encodeURIComponent(indicator.value)}&limit=5`;
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain.qzz.io DFIR toolkit' },
      signal,
    });

    if (!res.ok) {
      return base('error', toProviderError(classifyResponseError(res)));
    }

    const json = (await res.json()) as MaltiverseSearchResponse;
    const hits = json.hits?.hits ?? [];

    // Find the first exact match for our indicator type + value.
    const match = hits.find((h) => isExactMatch(h, indicator.type, indicator.value));

    if (!match?._source) {
      // No exact match in Maltiverse — treat as clean (not in any blacklist).
      return base('ok', { score: 0, verdict: 'clean', raw_summary: { found: false } });
    }

    const src = match._source;
    const classification = src.classification ?? 'unknown';
    const blacklist = src.blacklist ?? [];
    const { score, verdict } = classificationToScore(classification, blacklist.length);

    // Extract descriptive tags from blacklist entries and the tag array.
    const blTags = blacklist
      .map((b) => b.description)
      .filter((d): d is string => !!d)
      .slice(0, 8);
    const tags = [...new Set([...blTags, ...(src.tag ?? []).slice(0, 6)])].slice(0, 10);

    const sources = [...new Set(blacklist.map((b) => b.source).filter(Boolean))] as string[];

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        found: true,
        classification,
        blacklist_count: blacklist.length,
        sources: sources.slice(0, 8),
      },
      tags,
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
