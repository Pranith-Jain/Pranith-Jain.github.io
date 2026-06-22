import type { Candidate } from '../types';

export interface RunDiscoveryDeps {
  /** Topic name → runner. Generic so new topics (breach, scam, aisec,
   *  intel, …) slot in without changing the orchestrator. */
  runners: Record<string, () => Promise<Candidate[]>>;
  putCandidate: (c: Candidate) => Promise<void>;
  /** Mark all kept stable-keys "seen" in ONE batched read+write. */
  commitDedup: (keys: string[], now: Date) => Promise<void>;
  now: Date;
  /**
   * Max candidates kept *per topic* (default 3). Selection is per-topic, not
   * a global top-N — a global slice let the highest-scoring topic (usually
   * `actor`) crowd every other topic out of the queue. Per-topic selection
   * guarantees every topic that produced candidates is represented.
   */
  perTopic?: number;
  /**
   * Optional overall cap applied AFTER per-topic selection. Unset = no extra
   * cap (the per-topic limits already bound the total to perTopic × topics).
   */
  limit?: number;
  /**
   * Hard novelty gate. Returns true if a candidate key was already
   * surfaced/published recently and must NOT be re-suggested yet.
   */
  isSuppressed?: (key: string) => boolean;
  /**
   * Per-topic selector. Default = strict top-N by score.
   */
  selectPerTopic?: (cands: Candidate[], k: number, topic: string) => Candidate[];
  /**
   * Per-topic override for `perTopic`.
   */
  perTopicOverride?: Record<string, number>;
}

export interface RunDiscoveryResult {
  total: number;
  kept: number;
  /** Candidates dropped by the hard novelty gate (anti-repetition). */
  suppressed: number;
  /** Candidates dropped by cross-runner URL dedup. */
  deduped: number;
  ids: string[];
  /** Kept count per topic — recomputed AFTER URL dedup + global cap so
   *  the admin sees the real topic mix, not the pre-dedup selection. */
  byTopic: Record<string, number>;
  /** Per-topic counts BEFORE URL dedup and global cap. Useful for
   *  diagnosing a runner that gets cannibalised by another runner that
   *  surfaces the same article (e.g. intel + news on the same CVE writeup).
   *  If selected >> kept for a topic, split that topic into sub-topics
   *  or lower its perTopic budget. */
  byTopicSelected: Record<string, number>;
}

export async function runDiscovery(deps: RunDiscoveryDeps): Promise<RunDiscoveryResult> {
  const perTopic = deps.perTopic ?? 3;
  const isSuppressed = deps.isSuppressed ?? (() => false);
  // Pre-dedup per-topic counts — see RunDiscoveryResult.byTopicSelected.
  const byTopicSelected: Record<string, number> = {};
  let total = 0;
  let suppressed = 0;
  let selected: Candidate[] = [];
  const entries = Object.entries(deps.runners);

  // Run up to 4 runners in parallel per batch to stay within subrequest
  // budget while reducing wall-clock time vs sequential iteration.
  const BATCH_SIZE = 4;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ([name, runner]) => {
        const t0 = performance.now();
        try {
          const out = await runner();
          return { name, cands: out, error: null, ms: Math.round(performance.now() - t0) };
        } catch (err) {
          return { name, cands: [] as Candidate[], error: err, ms: Math.round(performance.now() - t0) };
        }
      })
    );
    for (const { name, cands, error, ms } of batchResults) {
      if (error) {
        console.warn(JSON.stringify({ job: 'discovery', runner: name, ms, error: String(error) }));
        byTopicSelected[name] = 0;
        continue;
      }
      total += cands.length;
      // Drop already-surfaced keys BEFORE selection so a fresher,
      // lower-scored candidate can take the slot instead of the same
      // recurring story.
      const fresh = cands.filter((c) => {
        if (isSuppressed(c.key)) {
          suppressed += 1;
          return false;
        }
        return true;
      });
      const topicPerTopic = deps.perTopicOverride?.[name] ?? perTopic;
      const select =
        deps.selectPerTopic ?? ((cs: Candidate[], k: number) => [...cs].sort((a, b) => b.score - a.score).slice(0, k));
      const top = select(fresh, topicPerTopic, name);
      byTopicSelected[name] = top.length;
      selected.push(...top);
    }
  }

  // Cross-runner URL dedup: same article discovered by two different runners
  // (e.g. intel + news) produces different stable-keys but the same evidence.url.
  // Keep only the highest-scored candidate per URL so we don't waste LLM
  // generation on duplicate content with different labels.
  const seenUrl = new Set<string>();
  let deduped = 0;
  selected = selected.filter((c) => {
    const u = typeof c.evidence?.url === 'string' ? c.evidence.url : '';
    if (!u) return true;
    if (seenUrl.has(u)) {
      deduped += 1;
      return false;
    }
    seenUrl.add(u);
    return true;
  });

  // Sort by score for the optional global cap.
  selected.sort((a, b) => b.score - a.score);
  const kept = typeof deps.limit === 'number' ? selected.slice(0, deps.limit) : selected;

  // Recompute byTopic from the *actual* kept candidates so the admin sees
  // the real topic mix. `byTopicSelected` would over-count topics whose
  // candidates were dropped by URL dedup or the global cap. The candidate
  // .type (CaseStudyType) is the canonical topic key — runner names are
  // 1:1 with types in run.ts (discoverOsint → 'osint', discoverTools →
  // 'tool', …), so re-aggregating by type gives the same shape the
  // orchestrator used to populate byTopicSelected.
  const byTopic: Record<string, number> = {};
  for (const c of kept) {
    byTopic[c.type] = (byTopic[c.type] ?? 0) + 1;
  }
  // Zero-fill topics that produced no kept candidates so the admin can
  // still see they ran.
  for (const name of Object.keys(byTopicSelected)) {
    if (!(name in byTopic)) byTopic[name] = 0;
  }

  await Promise.all(kept.map((c) => deps.putCandidate(c)));
  // One read+write for the whole dedup map instead of one per kept candidate.
  await deps.commitDedup(
    kept.map((c) => c.key),
    deps.now
  );

  console.log(
    JSON.stringify({
      job: 'discovery',
      total,
      suppressed,
      deduped,
      kept: kept.length,
      byTopicSelected,
      byTopic,
    })
  );

  return {
    total,
    kept: kept.length,
    suppressed,
    deduped,
    ids: kept.map((c) => c.key),
    byTopic,
    byTopicSelected,
  };
}
