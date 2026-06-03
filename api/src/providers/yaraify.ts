import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['hash']);
const API_URL = 'https://yaraify-api.abuse.ch/api/v1/';

export const yaraify: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'yaraify',
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
  if (!env.ABUSECH_AUTH_KEY) return base('error', { error: 'no_abusech_key' });

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Auth-Key': env.ABUSECH_AUTH_KEY },
      body: new URLSearchParams({ query: 'lookup_hash', search_term: indicator.value.toLowerCase() }),
      signal,
    });

    if (!res.ok) return base('error', { error: `${res.status}` });

    // YARAify nests everything under `data`; lookup_hash returns metadata + a
    // `tasks` array (each task holds clamav_results / static_results / unpack_results).
    // Reading flat top-level fields silently yields all-undefined → false "clean".
    const json = (await res.json()) as {
      query_status?: string;
      data?: {
        metadata?: { first_seen?: string; last_seen?: string; sightings?: number };
        tasks?: Array<{
          clamav_results?: string[] | null;
          static_results?: Array<{ rule_name?: string }> | null;
          unpack_results?: Array<{ unpacked_yara_matches?: Array<{ rule_name?: string }> | null }> | null;
        }>;
      };
    };

    const qs = json.query_status;
    if (qs !== 'ok') {
      // no_result / hash_not_found / illegal_hash → genuinely unknown to YARAify, treat as clean-ish
      if (qs === 'no_result' || qs === 'hash_not_found') {
        return base('ok', { score: 0, verdict: 'clean', raw_summary: { found: false } });
      }
      return base('error', { error: qs ?? 'unknown_status' });
    }

    const tasks = json.data?.tasks ?? [];
    const meta = json.data?.metadata;
    const yaraCount = tasks.reduce(
      (n, t) =>
        n +
        (t.static_results?.length ?? 0) +
        (t.unpack_results ?? []).reduce((m, u) => m + (u.unpacked_yara_matches?.length ?? 0), 0),
      0
    );
    const clamCount = tasks.reduce((n, t) => n + (t.clamav_results?.length ?? 0), 0);
    const totalSignals = yaraCount + clamCount;

    const score = Math.min(100, Math.round(totalSignals * 15));
    const verdict = score >= 50 ? 'malicious' : score >= 15 ? 'suspicious' : 'clean';
    const tags: string[] = [];
    if (yaraCount > 0) tags.push(`${yaraCount}-yara-rules`);
    if (clamCount > 0) tags.push(`${clamCount}-clamav`);

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        first_seen: meta?.first_seen,
        last_seen: meta?.last_seen,
        sightings: meta?.sightings,
        yara_rules: yaraCount,
        clamav: clamCount,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
