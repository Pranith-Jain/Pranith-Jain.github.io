/**
 * Cross-platform coordination + readiness gate.
 *
 * The content-engine skill's quality gate requires:
 *   - "no duplicated copy across platforms unless requested"
 *   - "every draft contains a real claim, proof point, or concrete observation"
 *   - "gaps that must be filled before publishing"
 *
 * The existing social generator runs Twitter / LinkedIn / Instagram in
 * parallel via Promise.allSettled with NO coordination between them. Each
 * platform independently generates from the same source body, so the same
 * hook / angle / opening line can leak across all three — exactly the
 * "platform-shaped filler" the skill warns against.
 *
 * This module runs AFTER generation and measures:
 *   1. Cross-platform hook diversity — do the three platforms open with
 *      materially different angles, or did the model copy-paste the lead?
 *   2. Cross-platform body overlap — how much prose is shared verbatim?
 *   3. Per-platform quality aggregation — roll the existing SocialQuality
 *      scores into a single readiness verdict.
 *
 * It does NOT regenerate — it reports. The admin sees the verdict in the
 * DraftsTab / PublishedTab social preview, and can regenerate a platform
 * that's too similar to another. This keeps the gate advisory (the
 * existing per-platform validateSocial already hard-blocks on char limits
 * and slop); the cross-platform check is a quality signal, not a publish
 * blocker, so a borderline post still ships.
 */

import type { SocialContent, SocialQuality, ReadinessVerdict } from '../types';

// Re-export ReadinessVerdict so existing imports from this module keep working.
export type { ReadinessVerdict };

/** A platform's generated copy + its quality score. */
export interface PlatformCopy {
  platform: 'twitter' | 'linkedin' | 'instagram';
  text: string;
  quality?: SocialQuality;
}

export interface CrossPlatformReport {
  /** 0-100. How different the three platforms' opening lines are. 100 = totally distinct. */
  hookDiversity: number;
  /** 0-100. How different the three platforms' bodies are (n-gram overlap). */
  bodyOverlap: number;
  /** Pairs of platforms whose hooks are too similar (Jaccard > 0.6). */
  similarHookPairs: Array<{ a: string; b: string; similarity: number }>;
  /** Pairs of platforms whose bodies share too much prose. */
  similarBodyPairs: Array<{ a: string; b: string; similarity: number }>;
  /** The extracted opening line (hook) per platform, for the admin preview. */
  hooks: { twitter?: string; linkedin?: string; instagram?: string };
}

// ReadinessVerdict is defined in ../types (canonical location) and
// re-exported above. CrossPlatformReport stays here — it's an internal
// detail of the readiness analysis, not part of the persisted KV shape.

// ── Text normalization ────────────────────────────────────────────────────

/** Strip platform chrome (FIRST COMMENT/REPLY links, thread counters,
 *  hashtags, the portfolio signature) so we compare the actual prose,
 *  not the boilerplate every platform shares by design. */
function normalizeForCompare(text: string): string {
  return text
    .replace(/FIRST (COMMENT|REPLY):\s*https?:\/\/\S+/gi, '')
    .replace(/\(\d+\/\d+\)/g, '') // thread counters
    .replace(/#[\w]+/g, '') // hashtags
    .replace(/— Pranith Jain ▰ pranithjain\.qzz\.io/gi, '')
    .replace(/▰▰▰ Pranith Jain[^\n]*/g, '')
    .replace(/https?:\/\/\S+/g, '') // bare URLs
    .replace(/[`*_>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Extract the opening hook — the first content block, stripped of chrome. */
function extractHook(text: string): string {
  const normalized = text
    .replace(/FIRST (COMMENT|REPLY):\s*https?:\/\/\S+/gi, '')
    .replace(/\(\d+\/\d+\)/g, '')
    .replace(/^CAROUSEL OUTLINE:.*$/im, '')
    .trim();
  // First paragraph or first tweet
  const firstBlock = normalized.split(/\n\n+/)[0] ?? normalized;
  const firstLine = firstBlock.split('\n')[0] ?? '';
  return firstLine
    .replace(/^[•\-\d.]+\s*/, '')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

// ── N-gram Jaccard similarity ─────────────────────────────────────────────

/** Build a set of word n-grams from text. */
function ngrams(text: string, n: number): Set<string> {
  const words = text.split(/\s+/).filter((w) => w.length > 2);
  if (words.length < n) return new Set();
  const set = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(' '));
  }
  return set;
}

/** Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|. 0 = disjoint, 1 = identical. */
function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  // Iterate the smaller set for efficiency.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Cross-platform analysis ──────────────────────────────────────────────

const HOOK_SIMILARITY_THRESHOLD = 0.6;
const BODY_SIMILARITY_THRESHOLD = 0.45;

/**
 * Measure cross-platform diversity. Compares the hook (opening line) and
 * the body (3-gram overlap) across every pair of platforms that have copy.
 */
export function analyzeCrossPlatform(copies: PlatformCopy[]): CrossPlatformReport {
  const present = copies.filter((c) => c.text.trim().length > 0);
  const hooks: CrossPlatformReport['hooks'] = {};
  const hookMap = new Map<string, string>();
  const bodyMap = new Map<string, string>();

  for (const c of present) {
    const hook = extractHook(c.text);
    const body = normalizeForCompare(c.text);
    hooks[c.platform] = hook.slice(0, 120) || undefined;
    hookMap.set(c.platform, hook);
    bodyMap.set(c.platform, body);
  }

  const similarHookPairs: CrossPlatformReport['similarHookPairs'] = [];
  const similarBodyPairs: CrossPlatformReport['similarBodyPairs'] = [];

  const platforms = present.map((c) => c.platform);
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const a = platforms[i]!;
      const b = platforms[j]!;
      const hookA = hookMap.get(a)!;
      const hookB = hookMap.get(b)!;
      const bodyA = bodyMap.get(a)!;
      const bodyB = bodyMap.get(b)!;

      // Hook similarity: word-level Jaccard on the opening line.
      if (hookA && hookB) {
        const hookSim = jaccard(new Set(hookA.split(/\s+/)), new Set(hookB.split(/\s+/)));
        if (hookSim > HOOK_SIMILARITY_THRESHOLD) {
          similarHookPairs.push({ a, b, similarity: Number(hookSim.toFixed(3)) });
        }
      }

      // Body similarity: 3-gram Jaccard on the normalized body.
      if (bodyA && bodyB) {
        const bodySim = jaccard(ngrams(bodyA, 3), ngrams(bodyB, 3));
        if (bodySim > BODY_SIMILARITY_THRESHOLD) {
          similarBodyPairs.push({ a, b, similarity: Number(bodySim.toFixed(3)) });
        }
      }
    }
  }

  // Diversity score: 100 minus the worst pairwise hook similarity.
  // If hooks are identical (sim=1), diversity=0. If totally distinct, 100.
  const maxHookSim = similarHookPairs.length > 0 ? Math.max(...similarHookPairs.map((p) => p.similarity)) : 0;
  const hookDiversity = Math.round((1 - maxHookSim) * 100);

  // Body overlap: the worst pairwise 3-gram overlap, inverted.
  const maxBodySim = similarBodyPairs.length > 0 ? Math.max(...similarBodyPairs.map((p) => p.similarity)) : 0;
  const bodyOverlap = Math.round((1 - maxBodySim) * 100);

  return { hookDiversity, bodyOverlap, similarHookPairs, similarBodyPairs, hooks };
}

// ── Readiness gate ───────────────────────────────────────────────────────

/** Minimum quality score per platform to be considered "ready". */
const MIN_QUALITY_SCORE = 60;
/** Minimum cross-platform hook diversity to avoid "same post, 3 platforms". */
const MIN_HOOK_DIVERSITY = 40;

/**
 * Aggregate per-platform quality + cross-platform diversity into a single
 * readiness verdict. This is the content-engine skill's "quality gate"
 * applied across the whole campaign, not just one platform at a time.
 *
 * Blockers = things that should stop a publish (char limit, slop, no
 * concrete specifics). Warnings = quality signals (low diversity, thin
 * score, cross-platform similarity) that the admin should review but
 * don't auto-block.
 */
export function assessReadiness(content: SocialContent): ReadinessVerdict {
  const copies: PlatformCopy[] = [
    { platform: 'twitter', text: content.twitter, quality: content._validation?.twitter_quality },
    { platform: 'linkedin', text: content.linkedin, quality: content._validation?.linkedin_quality },
    {
      platform: 'instagram',
      text: content.instagram ?? '',
      quality: content._validation?.instagram_quality,
    },
  ];

  const crossPlatform = analyzeCrossPlatform(copies);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const platforms: ReadinessVerdict['platforms'] = [];

  for (const c of copies) {
    const present = c.text.trim().length > 0;
    const score = c.quality?.score ?? 0;
    const overLimit = c.quality?.over_limit ?? false;
    const issues = c.quality?.issues ?? [];

    platforms.push({
      platform: c.platform,
      present,
      score,
      overLimit,
      issues,
    });

    if (present && overLimit) {
      blockers.push(`${c.platform}: exceeds character limit (${issues.join('; ')})`);
    }
    if (present && score < MIN_QUALITY_SCORE) {
      warnings.push(`${c.platform}: quality score ${score} < ${MIN_QUALITY_SCORE} (${issues.slice(0, 2).join('; ')})`);
    }
    if (!present && c.platform !== 'instagram') {
      // Instagram is optional (carousel-only sometimes); Twitter + LinkedIn are expected.
      warnings.push(`${c.platform}: no copy generated`);
    }
  }

  // Cross-platform diversity warnings (the content-engine skill's
  // "no duplicated copy across platforms" gate).
  for (const pair of crossPlatform.similarHookPairs) {
    warnings.push(
      `${pair.a}/${pair.b} hooks are ${Math.round(pair.similarity * 100)}% similar — each platform should lead with a different angle`
    );
  }
  for (const pair of crossPlatform.similarBodyPairs) {
    warnings.push(
      `${pair.a}/${pair.b} bodies share ${Math.round(pair.similarity * 100)}% prose — adapt the format, don't copy the text`
    );
  }
  if (crossPlatform.hookDiversity < MIN_HOOK_DIVERSITY && copies.filter((c) => c.text.trim()).length >= 2) {
    warnings.push(
      `Cross-platform hook diversity is ${crossPlatform.hookDiversity}/100 — the platforms open too similarly`
    );
  }

  // Aggregate score: weighted average of per-platform scores, penalized by
  // cross-platform similarity. A campaign where all three platforms score
  // 80 but share the same hook gets dinged harder than three 70s with
  // distinct angles.
  const presentPlatforms = platforms.filter((p) => p.present);
  const avgScore =
    presentPlatforms.length > 0 ? presentPlatforms.reduce((s, p) => s + p.score, 0) / presentPlatforms.length : 0;
  const diversityPenalty = (100 - crossPlatform.hookDiversity) * 0.15;
  const score = Math.max(0, Math.round(avgScore - diversityPenalty));

  const ready = blockers.length === 0 && score >= MIN_QUALITY_SCORE;

  return { score, ready, blockers, warnings, platforms, crossPlatform };
}

/** Format the readiness verdict for the admin UI / logs. */
export function formatReadiness(verdict: ReadinessVerdict): string {
  const status = verdict.ready ? '✓ READY' : '✗ NOT READY';
  const lines = [`${status} — score ${verdict.score}/100`];
  if (verdict.blockers.length > 0) {
    lines.push('  Blockers:');
    for (const b of verdict.blockers) lines.push(`    ✗ ${b}`);
  }
  if (verdict.warnings.length > 0) {
    lines.push('  Warnings:');
    for (const w of verdict.warnings) lines.push(`    ⚠ ${w}`);
  }
  if (verdict.crossPlatform.hookDiversity < 100) {
    lines.push(
      `  Cross-platform: hook diversity ${verdict.crossPlatform.hookDiversity}/100, body overlap ${verdict.crossPlatform.bodyOverlap}/100`
    );
  }
  return lines.join('\n');
}
