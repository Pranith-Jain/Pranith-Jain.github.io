import type { Context } from 'hono';
import type { Env } from '../env';
import { parseHeaders, parseAuthResults, extractUrls } from '../lib/email-parse';
import { phishingScore } from '../lib/phishing-score';
import { urlhaus } from '../providers/urlhaus';
import { openphish } from '../providers/openphish';
import { threatfox } from '../providers/threatfox';
import { phishingArmy } from '../providers/phishingArmy';
import { tweetfeed } from '../providers/tweetfeed';
import type { ProviderEnv, ProviderResult } from '../providers/types';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_URLS_TO_CHECK = 10;

interface UrlVerdict {
  url: string;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  hits: { source: string; tags: string[] }[];
}

export async function phishingAnalyzeHandler(c: Context<{ Bindings: Env }>) {
  const text = await c.req.text();
  if (!text || text.trim().length === 0) {
    return c.json({ error: 'empty body' }, 400);
  }
  if (new Blob([text]).size > MAX_BODY_BYTES) {
    return c.json({ error: 'body too large (max 64KB)' }, 413);
  }

  const headers = parseHeaders(text);
  const auth = parseAuthResults(
    typeof headers['authentication-results'] === 'string' ? headers['authentication-results'] : ''
  );
  const urls = extractUrls(text);
  const result = phishingScore({ headers, auth, urls });

  // Threat intel cross-check on extracted URLs (capped to avoid excessive fan-out).
  const env: ProviderEnv = {
    VT_API_KEY: c.env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
    OTX_API_KEY: c.env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: c.env.ABUSECH_AUTH_KEY,
  };
  const signal = AbortSignal.timeout(8000);
  const urlProviders = [urlhaus, openphish, threatfox, phishingArmy, tweetfeed];

  const uniqueUrls = Array.from(new Set(urls)).slice(0, MAX_URLS_TO_CHECK);
  const threat_intel: UrlVerdict[] = await Promise.all(
    uniqueUrls.map(async (url) => {
      const indicator = { type: 'url' as const, value: url };
      const results = await Promise.all(
        urlProviders.map((p) =>
          p(indicator, env, signal).catch(
            (err): ProviderResult => ({
              source: 'urlhaus',
              status: 'error',
              score: 0,
              verdict: 'unknown',
              raw_summary: {},
              tags: [],
              error: err instanceof Error ? err.message : String(err),
              fetched_at: new Date().toISOString(),
              cached: false,
            })
          )
        )
      );
      const hits = results
        .filter((r) => r.status === 'ok' && (r.verdict === 'malicious' || r.verdict === 'suspicious'))
        .map((r) => ({ source: r.source, tags: r.tags }));
      const verdict: UrlVerdict['verdict'] =
        hits.length >= 2
          ? 'malicious'
          : hits.length === 1
            ? 'suspicious'
            : results.some((r) => r.status === 'ok')
              ? 'clean'
              : 'unknown';
      return { url, verdict, hits };
    })
  );

  const tiHits = threat_intel.reduce((acc, u) => acc + u.hits.length, 0);
  const tiFlags =
    tiHits > 0 ? [...result.flags, `threat-intel: ${tiHits} hit${tiHits === 1 ? '' : 's'}`] : result.flags;
  // Bump score if any URL was confirmed malicious by threat intel.
  const tiBoost = threat_intel.some((u) => u.verdict === 'malicious')
    ? 25
    : threat_intel.some((u) => u.verdict === 'suspicious')
      ? 10
      : 0;
  const score = Math.min(100, result.score + tiBoost);
  const verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

  return c.json({
    headers,
    auth,
    urls,
    score,
    verdict,
    flags: tiFlags,
    threat_intel,
  });
}
