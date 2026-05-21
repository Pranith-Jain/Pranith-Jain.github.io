import type { KVNamespace } from '@cloudflare/workers-types';
import type { PsiResult } from './psi';

/**
 * Perf snapshot storage. Two KV blobs:
 *   - `perf:latest`   — the most recent run (read by /api/v1/perf for the
 *                       dashboard's current panel).
 *   - `perf:history`  — last 30 daily snapshots, keyed by ISO date. Used
 *                       to render the 7- / 30-day trend lines.
 *
 * Storage shape kept verbose-yet-flat: `results: PsiResult[]` rather
 * than the deeply-nested PSI response. PSI is the source of truth at
 * fetch time; we don't try to keep every audit metric — only the score
 * + lab CWV + field CWV the dashboard renders.
 */

export interface PerfSnapshot {
  /** ISO 8601 instant the cron started this run. Snapshot date for the
   *  history blob is the YYYY-MM-DD prefix. */
  generated_at: string;
  results: PsiResult[];
}

export type PerfHistory = Record<string, PerfSnapshot>;

/** Cap on the history record. Each snapshot is ~5-10 KB so 30 entries
 *  is well under KV's 25 MB value ceiling and keeps the read fast. */
const HISTORY_CAP = 30;

const K_LATEST = 'perf:latest';
const K_HISTORY = 'perf:history';

export async function getLatest(ns: KVNamespace): Promise<PerfSnapshot | null> {
  return (await ns.get(K_LATEST, 'json')) as PerfSnapshot | null;
}

export async function getHistory(ns: KVNamespace): Promise<PerfHistory> {
  return ((await ns.get(K_HISTORY, 'json')) as PerfHistory | null) ?? {};
}

/**
 * Persist a snapshot to both keys. Latest is overwritten; the date keyed
 * into history rolls the oldest entry off if we're past the cap. Date
 * collision (two runs same UTC day) overwrites the older entry — kept
 * tighter than appending, so /api/v1/perf history is one row per day.
 */
export async function saveSnapshot(ns: KVNamespace, snap: PerfSnapshot): Promise<void> {
  await ns.put(K_LATEST, JSON.stringify(snap));
  const date = snap.generated_at.slice(0, 10); // YYYY-MM-DD
  const history = await getHistory(ns);
  history[date] = snap;
  // Sort by date desc, trim to cap. Older dates fall off the tail.
  const entries = Object.entries(history)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, HISTORY_CAP);
  const trimmed: PerfHistory = {};
  for (const [k, v] of entries) trimmed[k] = v;
  await ns.put(K_HISTORY, JSON.stringify(trimmed));
}
