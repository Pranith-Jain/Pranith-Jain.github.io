/**
 * TIFCE — TI Feed Content Evaluation engine.
 *
 * Pure, dependency-free scoring functions for the four pillars defined by
 * the TIFCE framework (https://zenodo.org/records/18208974) plus a composite.
 * The original framework is a Microsoft Sentinel KQL workbook, scoped to
 * tables like `ThreatIntelIndicators`, `DeviceFileEvents`, `EmailEvents`,
 * and `SecurityIncident`. This file is a vendor-neutral re-implementation
 * that operates on the per-feed contribution shape already produced by
 * `api/src/routes/ioc-correlation.ts` (cross-feed counts) and
 * `api/src/routes/live-iocs.ts` (per-feed newest_observation, item counts,
 * per-entry timestamps).
 *
 * ─── Honest scoping note ───────────────────────────────────────────────
 * Pillars 2 (Environmental Relevance) and 3 (Signal vs Noise) in the
 * reference TIFCE workbook answer tenant-side questions: "do these IOCs hit
 * MY endpoint / email telemetry?" and "do they correlate to MY confirmed
 * incidents?" This platform is a public CTI aggregator with no tenant
 * telemetry. We approximate both with the strongest in-platform signals
 * we actually have:
 *
 *   - Pillar 2: a feed's IOCs that we have ourselves reported on in a
 *     case-study briefing OR that the detection-rules engine has fired on
 *     in the last 24h. The page surfaces this as "platform relevance"
 *     rather than "env relevance" so it isn't misread as a tenant metric.
 *   - Pillar 3: a feed's IOCs that achieved `peak_score > 0` in the
 *     `ioc_lifecycle` table — the strongest TP signal we track.
 *
 * Both approximations are documented in the page UI; analysts should
 * interpret them as "the platform's view" rather than tenant telemetry.
 * ────────────────────────────────────────────────────────────────────────
 *
 * All functions are pure (no I/O) so the route can call them on a frozen
 * snapshot of the upstream data. The companion test file
 * `api/test/lib/tifce.test.ts` covers edge cases (empty feeds, single-feed
 * world, decayed feeds, etc.).
 */

import type { CorrelatedIoc } from '../routes/ioc-correlation';
import type { LiveIoc, LiveSource } from '../routes/live-iocs';

// ────────────────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────────────────

/** A single feed's contribution to the live-IOC stream. */
export interface FeedContribution {
  /** The feed's registry id (e.g. 'tweetfeed', 'urlhaus', 'emerging-threats'). */
  feedId: string;
  /** IOCs the feed contributed on the current build, with per-entry timestamps. */
  items: LiveIoc[];
  /** Source health row from the live-IOC compose. */
  source: LiveSource;
}

/** Per-IOC cross-feed counts (built once from the ioc-correlation response). */
export interface CrossFeedIndex {
  /** value → number of distinct feeds that reported it. */
  counts: Map<string, number>;
  /** value → feed ids that reported it. */
  sources: Map<string, string[]>;
}

/** Historical TIFCE snapshots for a single feed, oldest → newest. */
export interface TifceHistoryRow {
  generated_at: string;
  contributions: number;
}

/** Inputs the route collects before calling `scoreFeed`. */
export interface TifceInputs {
  feeds: FeedContribution[];
  /** All IOCs the platform tracked to peak_score > 0 in ioc_lifecycle (TP proxy). */
  tpIndicatorSet: Set<string>;
  /** IOCs the platform has reported on in a case-study briefing (platform-relevance). */
  platformReportedSet: Set<string>;
  /** IOCs the detection-rules engine has fired on in the last 24h. */
  detectionFiredSet: Set<string>;
  /** Historical TIFCE rows per feed, oldest → newest. Empty for the first build. */
  history: Record<string, TifceHistoryRow[]>;
  /** Build timestamp (ms since epoch). Test-friendly — defaults to Date.now(). */
  nowMs?: number;
}

// ────────────────────────────────────────────────────────────────────────
// Outputs
// ────────────────────────────────────────────────────────────────────────

export interface PillarScore {
  /** 0–100, higher is better. */
  score: number;
  /** Short human label. */
  label: string;
  /** A 1–2 sentence analyst-facing explanation of why this score is what it is. */
  rationale: string;
  /** Forensic details that drove the score (for the UI's expandable debug row). */
  details: Record<string, number | string>;
}

export interface FeedTifceScore {
  feedId: string;
  /** Number of IOCs the feed contributed on this build. */
  contributions: number;
  /** Pillar 1: originality (rarity-weighted). */
  originality: PillarScore;
  /** Pillar 2: platform-relevance proxy (TP + detection firings). */
  envRelevance: PillarScore;
  /** Pillar 3: signal-vs-noise (TP correlation ratio). */
  signalNoise: PillarScore;
  /** Pillar 4: freshness (recency + IOC-add velocity). */
  freshness: PillarScore;
  /** Weighted blend of the four pillars. */
  composite: number;
  /** Letter grade A–F, computed from the composite. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface TifceResult {
  generated_at: string;
  /** Per-feed scores, ordered by composite desc. */
  feeds: FeedTifceScore[];
  /** Build-wide summary (medians, top/bottom). */
  summary: {
    total_feeds: number;
    feeds_evaluated: number;
    /** Count of feeds with `grade` in A/B (above the quality bar). */
    above_bar: number;
    median_composite: number;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Composite weights
// ────────────────────────────────────────────────────────────────────────
//
// The TIFCE reference workbook treats all four pillars as co-equal inputs to
// a final 0–100 scorecard. We slightly up-weight originality (a feed that
// contributes only duplicates of other feeds is structurally lower value no
// matter how fresh or signal-rich it is) and down-weight env-relevance (our
// platform-side proxy is noisier than the other three — see the scoping
// note at the top of the file).
//
// Weights must sum to 1.0.
const PILLAR_WEIGHTS = {
  originality: 0.3,
  envRelevance: 0.2,
  signalNoise: 0.25,
  freshness: 0.25,
} as const;

// ────────────────────────────────────────────────────────────────────────
// Pillar 1 — Originality (rarity-weighted)
// ────────────────────────────────────────────────────────────────────────

/**
 * Score a feed's originality on a 0–100 scale.
 *
 * Each IOC's contribution to the feed's score is weighted by 1/count — an
 * IOC that appears in N feeds contributes 1/N of what a unique IOC does.
 * This is the same inverse-frequency weighting TIFCE uses; it correctly
 * rewards feeds that add differentiated value and punishes feeds that
 * re-publish what every other feed already has.
 *
 * Returns a 0 when the feed contributed no IOCs, and clamps to 100 when
 * every contribution is unique across the whole cross-feed index.
 */
export function originalityPillar(feed: FeedContribution, crossFeed: CrossFeedIndex): PillarScore {
  if (feed.items.length === 0) {
    return {
      score: 0,
      label: 'no contribution',
      rationale: 'Feed did not return any IOCs on this build.',
      details: { unique: 0, shared: 0, total: 0 },
    };
  }

  let unique = 0;
  let shared = 0;
  let weightedSum = 0;
  for (const it of feed.items) {
    const c = crossFeed.counts.get(it.value) ?? 1;
    if (c <= 1) unique += 1;
    else shared += 1;
    weightedSum += 1 / c;
  }

  // Per-IOC average rarity in [0, 1]. 1.0 = every IOC is unique.
  // We also blend in a tiny share-of-unique bonus so a feed that contributes
  // ONLY unique IOCs scores measurably higher than a feed that contributes
  // mostly duplicates plus a few rare ones (the raw rarity average alone
  // can be close to 1.0 either way).
  const avgRarity = weightedSum / feed.items.length;
  const uniqueShare = unique / feed.items.length;
  const blended = avgRarity * 0.7 + uniqueShare * 0.3;

  return {
    score: clamp01to100(blended * 100),
    label: gradeBand(blended * 100),
    rationale:
      unique === feed.items.length
        ? `All ${feed.items.length} contributions are unique — not in any other feed's recent output.`
        : `${unique} unique + ${shared} shared (rarity-weighted). Feeds that add IOCs others don't have score higher.`,
    details: { unique, shared, total: feed.items.length, avg_rarity: round3(avgRarity) },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pillar 2 — Environmental Relevance (platform proxy)
// ────────────────────────────────────────────────────────────────────────

/**
 * Score a feed's relevance to this platform on a 0–100 scale.
 *
 * In the reference TIFCE workbook, Pillar 2 is "does this IOC appear in MY
 * endpoint/email telemetry?" This platform has no tenant telemetry. We
 * substitute the strongest platform-side signals we have:
 *
 *   - 0.6 weight on ioc_lifecycle peak_score > 0 hits (TP-like signal)
 *   - 0.3 weight on detection-rule firings in the last 24h
 *   - 0.1 weight on case-study briefings mentioning the IOC
 *
 * A feed with no overlap on any of those signals scores 0 (irrelevant to
 * the platform's own intel surface). A feed whose contributions all hit
 * at least one of the three sets scores 100.
 */
export function envRelevancePillar(
  feed: FeedContribution,
  tpSet: Set<string>,
  platformSet: Set<string>,
  detectionSet: Set<string>
): PillarScore {
  if (feed.items.length === 0) {
    return {
      score: 0,
      label: 'no contribution',
      rationale: 'Feed did not return any IOCs on this build.',
      details: { tp_hits: 0, detection_hits: 0, platform_hits: 0, total: 0 },
    };
  }

  let tpHits = 0;
  let detectionHits = 0;
  let platformHits = 0;
  for (const it of feed.items) {
    if (tpSet.has(it.value)) tpHits += 1;
    if (detectionSet.has(it.value)) detectionHits += 1;
    if (platformSet.has(it.value)) platformHits += 1;
  }

  // Weighted per-IOC hit score in [0, 1]. Capped per IOC — an IOC that
  // hits all three signals is still 1.0, not 1.6.
  const perIoc = feed.items.reduce((sum, it) => {
    const w =
      (tpSet.has(it.value) ? 0.6 : 0) + (detectionSet.has(it.value) ? 0.3 : 0) + (platformSet.has(it.value) ? 0.1 : 0);
    return sum + Math.min(1, w);
  }, 0);
  const normalized = perIoc / feed.items.length;

  return {
    score: clamp01to100(normalized * 100),
    label: gradeBand(normalized * 100),
    rationale:
      tpHits + detectionHits + platformHits === 0
        ? "None of this feed's IOCs appear in the platform's ioc_lifecycle, detection firings, or case-study briefings — i.e. the platform hasn't independently surfaced them yet."
        : `${tpHits} TP-linked · ${detectionHits} detection firings · ${platformHits} case-study mentions. TIFCE's tenant-telemetry pillar is approximated here by these in-platform signals.`,
    details: {
      tp_hits: tpHits,
      detection_hits: detectionHits,
      platform_hits: platformHits,
      total: feed.items.length,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pillar 3 — Signal vs Noise (TP correlation ratio)
// ────────────────────────────────────────────────────────────────────────

/**
 * Score a feed's signal-to-noise ratio on a 0–100 scale.
 *
 * In the reference TIFCE workbook, this pillar measures the share of a
 * feed's IOCs that correlate to TruePositive incidents. We approximate
 * that with the share that achieved `peak_score > 0` in the ioc_lifecycle
 * table — the strongest "this IOC was later confirmed malicious" signal
 * the platform tracks.
 *
 * We additionally apply a confidence adjustment: a feed that contributed
 * only 1 IOC and that 1 hit scored 100% is a single-IOC fluke, not a
 * pattern. We dampen scores with fewer than 5 TP hits so small feeds
 * can't game the pillar.
 */
export function signalNoisePillar(feed: FeedContribution, tpSet: Set<string>): PillarScore {
  if (feed.items.length === 0) {
    return {
      score: 0,
      label: 'no contribution',
      rationale: 'Feed did not return any IOCs on this build.',
      details: { tp_linked: 0, total: 0, ratio: 0 },
    };
  }

  let tpLinked = 0;
  for (const it of feed.items) if (tpSet.has(it.value)) tpLinked += 1;

  const ratio = tpLinked / feed.items.length;
  // Confidence: 1.0 at 25+ TP hits, falling to ~0.5 at 5, ~0.25 at 1.
  // Below 5 TP hits the signal isn't statistically meaningful — we still
  // report the raw ratio, but the pillar score is dampened so single-IOC
  // flukes don't earn an A.
  const confidence = Math.min(1, Math.log10(Math.max(1, tpLinked) * 4 + 1) / Math.log10(101));
  const dampened = ratio * (0.5 + 0.5 * confidence);

  return {
    score: clamp01to100(dampened * 100),
    label: gradeBand(dampened * 100),
    rationale:
      tpLinked === 0
        ? "None of this feed's IOCs were later confirmed malicious in the platform's lifecycle table — the strongest TP-proxy signal we track."
        : `${tpLinked}/${feed.items.length} of this feed's contributions (${pct(ratio)}) were later confirmed malicious. Score is dampened when TP hits < 5 to avoid single-IOC flukes.`,
    details: {
      tp_linked: tpLinked,
      total: feed.items.length,
      ratio: round3(ratio),
      confidence: round3(confidence),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pillar 4 — Freshness (recency + IOC-add velocity)
// ────────────────────────────────────────────────────────────────────────

/**
 * Score a feed's freshness on a 0–100 scale.
 *
 * Two components, equally weighted:
 *
 *   1. Recency (50%): age of the feed's newest per-entry observation.
 *      <24h → 100, <7d → 70, <30d → 40, >30d → 0. Feeds without per-entry
 *      timestamps (bulk-snapshot blocklists) score 50 by default — they
 *      reflect the upstream's current state by definition, so we neither
 *      penalize nor reward.
 *
 *   2. Velocity (50%): IOC-add slope from the trailing 7d history. We
 *      linear-regress contributions-per-day over the last 7d window and
 *      normalise against a soft cap (50 IOCs/day). With no history, we
 *      return 50 (neutral — no signal either way).
 */
export function freshnessPillar(
  feed: FeedContribution,
  history: TifceHistoryRow[] | undefined,
  nowMs: number
): PillarScore {
  if (feed.items.length === 0) {
    return {
      score: 0,
      label: 'no contribution',
      rationale: 'Feed did not return any IOCs on this build — no recency or velocity to measure.',
      details: { recency_component: 0, velocity_component: 0, velocity_per_day: 0, newest_observation: '—' },
    };
  }
  const newest = feed.source.newest_observation;
  const recencyScore = recencyComponent(newest, nowMs);
  const velocityScore = velocityComponent(history, nowMs);

  // 50/50 blend. Round to 1 decimal for stable UI.
  const blended = Math.round((recencyScore * 0.5 + velocityScore * 0.5) * 10) / 10;

  return {
    score: clamp01to100(blended),
    label: gradeBand(blended),
    rationale:
      newest === undefined
        ? 'No per-entry timestamps from this source — bulk-snapshot feeds get a neutral 50; recency is governed by the upstream publish cadence.'
        : `Recency: ${ageLabel(newest, nowMs)} · velocity: ${velocityRationale(history)}.`,
    details: {
      newest_observation: newest ?? '—',
      recency_component: round1(recencyScore),
      velocity_component: round1(velocityScore),
      // velocityScore is in [0, 100] and the velocityComponent() formula maps
      // 0 IOCs/day → 50 and the 50 IOCs/day soft cap → 100, so the reverse
      // mapping is `velocityScore - 50`. The old formula `velocityScore * 50`
      // produced values 50–100× too high (e.g. a rising feed at 25 IOCs/day
      // stored 3750, not 25), poisoning the persisted history even though
      // loadHistory() doesn't yet read it back.
      velocity_per_day: round1(velocityScore - 50),
    },
  };
}

function recencyComponent(newest: string | undefined, nowMs: number): number {
  if (!newest) return 50;
  const t = Date.parse(newest);
  if (!Number.isFinite(t)) return 50;
  const ageH = (nowMs - t) / 3_600_000;
  if (ageH < 0) return 100; // future timestamp (clock skew) — be generous
  if (ageH <= 24) return 100;
  if (ageH <= 24 * 3) return 85;
  if (ageH <= 24 * 7) return 70;
  if (ageH <= 24 * 14) return 55;
  if (ageH <= 24 * 30) return 40;
  if (ageH <= 24 * 60) return 20;
  return 5;
}

function velocityComponent(history: TifceHistoryRow[] | undefined, nowMs: number): number {
  if (!history || history.length < 2) return 50;
  // Use only the trailing 7d window. Pair each row with (now - row.time).
  const windowMs = 7 * 24 * 3_600_000;
  const points = history
    .filter((r) => nowMs - Date.parse(r.generated_at) <= windowMs)
    .map((r) => ({ t: Date.parse(r.generated_at) / 1000, y: r.contributions }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y));
  if (points.length < 2) return 50;

  // Simple OLS slope of y over t (in seconds). Multiply by seconds-per-day
  // so the result is "IOCs added per day".
  const n = points.length;
  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    const dt = p.t - meanT;
    num += dt * (p.y - meanY);
    den += dt * dt;
  }
  if (den === 0) return 50;
  const slopePerSec = num / den;
  const slopePerDay = slopePerSec * 86_400;

  // Negative slope = decaying feed. Map to [0, 0.5].
  // Positive slope cap at 50 IOCs/day → 1.0.
  if (slopePerDay <= 0) return clamp(50 + slopePerDay * 1, 0, 50);
  return clamp(50 + Math.min(slopePerDay, 50) * 1, 50, 100);
}

function velocityRationale(history: TifceHistoryRow[] | undefined): string {
  if (!history || history.length < 2) return 'no historical baseline (first build)';
  const recent = history.slice(-7);
  const oldest = recent[0]!;
  const newest = recent[recent.length - 1]!;
  const delta = newest.contributions - oldest.contributions;
  if (delta > 0) return `+${delta} IOCs over the last ${recent.length} builds`;
  if (delta < 0) return `${delta} IOCs over the last ${recent.length} builds (decaying)`;
  return `flat over the last ${recent.length} builds`;
}

// ────────────────────────────────────────────────────────────────────────
// Composite + grading
// ────────────────────────────────────────────────────────────────────────

function compositePillars(
  originality: PillarScore,
  envRelevance: PillarScore,
  signalNoise: PillarScore,
  freshness: PillarScore
): number {
  return clamp01to100(
    originality.score * PILLAR_WEIGHTS.originality +
      envRelevance.score * PILLAR_WEIGHTS.envRelevance +
      signalNoise.score * PILLAR_WEIGHTS.signalNoise +
      freshness.score * PILLAR_WEIGHTS.freshness
  );
}

export function letterGrade(composite: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (composite >= 80) return 'A';
  if (composite >= 65) return 'B';
  if (composite >= 50) return 'C';
  if (composite >= 35) return 'D';
  return 'F';
}

// ────────────────────────────────────────────────────────────────────────
// Top-level entry point
// ────────────────────────────────────────────────────────────────────────

/**
 * Build the cross-feed index from a list of correlated IOCs (the ioc-
 * correlation endpoint already gives us `source_count` + `sources` per
 * indicator). Doing the index once and passing it into every per-feed
 * score call keeps the per-feed O(contributions) loop cheap.
 */
export function buildCrossFeedIndex(correlated: CorrelatedIoc[]): CrossFeedIndex {
  const counts = new Map<string, number>();
  const sources = new Map<string, string[]>();
  for (const c of correlated) {
    counts.set(c.value, c.source_count);
    sources.set(c.value, c.sources);
  }
  return { counts, sources };
}

/**
 * Score every feed in `inputs.feeds` and return a `TifceResult` ordered by
 * composite desc. The page renders the result directly; the route upserts
 * each per-feed row to `tifce_scores` for the next build's velocity calc.
 */
export function scoreAllFeeds(inputs: TifceInputs): TifceResult {
  const nowMs = inputs.nowMs ?? Date.now();

  // Build a cross-feed index from the live items so Pillar 1 doesn't have
  // to take a second dependency on the ioc-correlation route. The "correct"
  // cross-feed view for TIFCE is the correlated-indicator one (2+ feeds),
  // but for the rarity denominator we want every distinct value the live
  // build touched and how many distinct feeds touched it — and we have
  // that data on hand from `inputs.feeds` without a second round trip.
  const crossFeed = buildCrossFeedIndexFromFeeds(inputs.feeds);

  const scored: FeedTifceScore[] = [];
  for (const feed of inputs.feeds) {
    const originality = originalityPillar(feed, crossFeed);
    const envRelevance = envRelevancePillar(
      feed,
      inputs.tpIndicatorSet,
      inputs.platformReportedSet,
      inputs.detectionFiredSet
    );
    const signalNoise = signalNoisePillar(feed, inputs.tpIndicatorSet);
    const freshness = freshnessPillar(feed, inputs.history[feed.feedId], nowMs);
    const composite = compositePillars(originality, envRelevance, signalNoise, freshness);

    scored.push({
      feedId: feed.feedId,
      contributions: feed.items.length,
      originality,
      envRelevance,
      signalNoise,
      freshness,
      composite,
      grade: letterGrade(composite),
    });
  }

  scored.sort((a, b) => b.composite - a.composite);

  const evaluated = scored.filter((s) => s.contributions > 0);
  const aboveBar = evaluated.filter((s) => s.grade === 'A' || s.grade === 'B').length;
  const composites = evaluated.map((s) => s.composite).sort((a, b) => a - b);
  const median =
    composites.length === 0
      ? 0
      : composites.length % 2 === 0
        ? (composites[composites.length / 2 - 1]! + composites[composites.length / 2]!) / 2
        : composites[(composites.length - 1) / 2]!;

  return {
    generated_at: new Date(nowMs).toISOString(),
    feeds: scored,
    summary: {
      total_feeds: inputs.feeds.length,
      feeds_evaluated: evaluated.length,
      above_bar: aboveBar,
      median_composite: round1(median),
    },
  };
}

function buildCrossFeedIndexFromFeeds(feeds: FeedContribution[]): CrossFeedIndex {
  const counts = new Map<string, number>();
  const sources = new Map<string, string[]>();
  for (const f of feeds) {
    for (const it of f.items) {
      counts.set(it.value, (counts.get(it.value) ?? 0) + 1);
      const cur = sources.get(it.value) ?? [];
      if (!cur.includes(f.feedId)) cur.push(f.feedId);
      sources.set(it.value, cur);
    }
  }
  return { counts, sources };
}

// ────────────────────────────────────────────────────────────────────────
// Small helpers (kept local to avoid cross-coupling to lib/*)
// ────────────────────────────────────────────────────────────────────────

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function gradeBand(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 35) return 'weak';
  return 'poor';
}

function ageLabel(newest: string, nowMs: number): string {
  const t = Date.parse(newest);
  if (!Number.isFinite(t)) return 'unknown';
  const ageH = (nowMs - t) / 3_600_000;
  if (ageH < 0) return 'clock skew';
  if (ageH < 1) return `${Math.round(ageH * 60)}m ago`;
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  return `${Math.round(ageH / 24)}d ago`;
}
