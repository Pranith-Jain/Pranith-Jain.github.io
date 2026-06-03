import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { isCapeConfigured, searchHash } from '../lib/cape-bridge';

/**
 * CAPE sandbox enrichment adapter (hash only).
 *
 * Looks a sample hash up against past analyses on the self-hosted CAPE bridge
 * (no detonation). Degrades to `unsupported` when the indicator isn't a hash or
 * `CAPE_BRIDGE_URL` is unset — so it's a no-op on the normal fan-out path until
 * an operator wires up CAPE. See lib/cape-bridge.ts.
 */
export const cape: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'cape',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (indicator.type !== 'hash') return base('unsupported');
  if (!isCapeConfigured(env)) return base('unsupported');

  try {
    const hit = await searchHash(env, indicator.value, signal);
    if (!hit.found) {
      return base('ok', { verdict: 'clean', score: 0, tags: ['not-in-sandbox'], raw_summary: { found: false } });
    }
    const malscore = hit.topScore;
    const score = malscore === null ? 0 : Math.max(0, Math.min(100, Math.round(malscore * 10)));
    const verdict: Verdict =
      malscore === null ? 'unknown' : malscore >= 7 ? 'malicious' : malscore >= 3 ? 'suspicious' : 'clean';
    return base('ok', {
      score,
      verdict,
      tags: [`sandboxed:${hit.taskCount}`, ...(malscore !== null ? [`malscore:${malscore}`] : [])],
      raw_summary: { found: true, taskCount: hit.taskCount, taskIds: hit.taskIds, malscore },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
