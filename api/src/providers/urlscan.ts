import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['url', 'domain']);

export const urlscan: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'urlscan',
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
    // urlscan.io expects a Lucene query, not a raw URL. Build the right field
    // selector based on the indicator type so we don't ship malformed queries.
    const q =
      indicator.type === 'url'
        ? `page.url:"${indicator.value.replace(/"/g, '\\"')}"`
        : `page.domain:${indicator.value}`;
    const url = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=10`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (env.URLSCAN_API_KEY) headers['API-Key'] = env.URLSCAN_API_KEY;

    const res = await fetch(url, { headers, signal });
    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['urlscan-no-access'],
        raw_summary: { reason: `${res.status} from URLScan` },
      });
    }
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as {
      results?: Array<{ tags?: string[]; task?: { url?: string } }>;
      total?: number;
    };

    const results = json.results ?? [];
    // urlscan's Search API runs with scoring DISABLED — `_score` is null on every
    // result, so the old `max(_score)` was always 0 and the verdict was always
    // 'clean', even for heavily-flagged phishing hosts (a false-negative that
    // diluted the composite). There's no reliable per-result verdict inline, so
    // derive a coarse signal from result tags and ABSTAIN ('unknown') rather
    // than asserting 'clean' on the absence of a signal.
    const allTags = [...new Set(results.flatMap((r) => r.tags ?? []).map((t) => t.toLowerCase()))];
    const MALICIOUS_TAGS = ['phishing', 'malicious', 'malware', 'c2'];
    const flagged = allTags.filter((t) => MALICIOUS_TAGS.some((m) => t.includes(m)));
    const score = flagged.length > 0 ? 60 : 0;
    const verdict: Verdict = flagged.length > 0 ? 'suspicious' : 'unknown';

    return base('ok', {
      score,
      verdict,
      raw_summary: {
        result_count: results.length,
        flagged_tags: flagged.slice(0, 8),
      },
      tags: allTags.slice(0, 10),
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
