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
  ids: string[];
  /** Kept count per topic — surfaced so the admin sees the topic mix. */
  byTopic: Record<string, number>;
}

export async function runDiscovery(deps: RunDiscoveryDeps): Promise<RunDiscoveryResult> {
  const perTopic = deps.perTopic ?? 3;
  const isSuppressed = deps.isSuppressed ?? (() => false);
  const byTopic: Record<string, number> = {};
  let total = 0;
  let suppressed = 0;
  const selected: Candidate[] = [];

  for (const [name, runner] of Object.entries(deps.runners)) {
    try {
      const results = await runner();
      total += results.length;
      // Drop already-surfaced keys BEFORE selection so a fresher,
      // lower-scored candidate can take the slot instead of the same
      // recurring story.
      const fresh = results.filter((c) => {
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
      byTopic[name] = top.length;
      selected.push(...top);
    } catch (err) {
      console.warn(`runDiscovery: ${name} runner failed`, err);
      byTopic[name] = 0;
    }
  }

  // Sort by score, but also consider topic diversity
  // This prevents one topic from dominating the final selection
  selected.sort((a, b) => b.score - a.score);
  const kept = typeof deps.limit === 'number' ? selected.slice(0, deps.limit) : selected;

  for (const c of kept) {
    await deps.putCandidate(c);
  }
  // One read+write for the whole dedup map instead of one per kept candidate.
  await deps.commitDedup(
    kept.map((c) => c.key),
    deps.now
  );

  // Track topic diversity for logging
  const topicCounts: Record<string, number> = {};
  for (const c of kept) {
    const topic = c.type;
    topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
  }

  console.log(
    JSON.stringify({
      job: 'discovery',
      total,
      suppressed,
      kept: kept.length,
      byTopic,
      topicDiversity: topicCounts,
      uniqueTopics: Object.keys(topicCounts).length,
      ids: kept.map((k) => k.key),
      ts: deps.now.toISOString(),
    })
  );

  return { total, kept: kept.length, suppressed, ids: kept.map((c) => c.key), byTopic };
}
