import type { KVNamespace } from '@cloudflare/workers-types';
import { fetchPsiBatch, type PsiStrategy } from './psi';
import { saveSnapshot, type PerfSnapshot } from './storage';

/**
 * Targets the daily Lighthouse cron measures. Hand-picked to cover the
 * three platform faces: portfolio root, DFIR hub, threat-intel hub, blog
 * index, plus the two deepest tool pages so a regression on those
 * doesn't hide behind a clean home-page score. Each is run twice —
 * mobile + desktop — because the two strategies routinely score 15+
 * points apart and tracking only one masks half the picture.
 */
const TARGETS: Array<{ url: string; label: string }> = [
  { url: 'https://pranithjain.qzz.io/', label: 'Home' },
  { url: 'https://pranithjain.qzz.io/dfir', label: 'DFIR hub' },
  { url: 'https://pranithjain.qzz.io/threatintel', label: 'Threat intel hub' },
  { url: 'https://pranithjain.qzz.io/blog', label: 'Blog' },
  { url: 'https://pranithjain.qzz.io/dfir/ioc-check', label: 'IOC Checker' },
  { url: 'https://pranithjain.qzz.io/dfir/detection-lab', label: 'Detection Lab' },
];

const STRATEGIES: PsiStrategy[] = ['mobile', 'desktop'];

export interface PerfRunnerEnv {
  KV_CACHE?: KVNamespace;
  /** Optional PSI API key — without it PSI rate-limits to 1 qps, which
   *  is still enough for the 12-request daily run (6 URLs × 2 strategies). */
  GOOGLE_PSI_API_KEY?: string;
}

/**
 * Daily perf cron entry point. Sequentially fetches PSI for every
 * (url × strategy) target and persists the snapshot. Defensive against
 * partial failures — a single PSI error per target is captured in that
 * target's `error` field, not thrown, so a bad URL doesn't kill the
 * whole run.
 */
export async function runPerfNow(env: PerfRunnerEnv, now: Date): Promise<{ measured: number; errors: number }> {
  if (!env.KV_CACHE) {
    console.warn(JSON.stringify({ job: 'perf', status: 'skipped_no_kv', ts: now.toISOString() }));
    return { measured: 0, errors: 0 };
  }

  const targets: Array<{ url: string; strategy: PsiStrategy }> = [];
  for (const t of TARGETS) {
    for (const s of STRATEGIES) {
      targets.push({ url: t.url, strategy: s });
    }
  }

  const results = await fetchPsiBatch(targets, { apiKey: env.GOOGLE_PSI_API_KEY });
  const errors = results.filter((r) => r.error).length;
  const snap: PerfSnapshot = {
    generated_at: now.toISOString(),
    results,
  };
  await saveSnapshot(env.KV_CACHE, snap);

  console.log(
    JSON.stringify({
      job: 'perf',
      measured: results.length,
      errors,
      ts: now.toISOString(),
    })
  );

  return { measured: results.length, errors };
}

/** Exported for the /api/v1/perf endpoint, the /perf page, and tests. */
export const PERF_TARGETS = TARGETS;
