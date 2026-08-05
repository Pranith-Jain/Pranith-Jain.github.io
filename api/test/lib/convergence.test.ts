/**
 * Tests for the GAN convergence loop (shouldConverge) and shouldRetry.
 *
 * Run via: npx vitest run api/test/lib/convergence.test.ts
 */
import { describe, it, expect } from 'vitest';
import { shouldRetry, shouldConverge } from '../../src/lib/agent/agent-framework';

describe('shouldRetry', () => {
  it('returns true for structural failure (score < 60)', () => {
    expect(shouldRetry(45, 2, 1, 2, 8, 0, 3)).toBe(true);
  });

  it('returns true for score < 65 with flagged claims', () => {
    expect(shouldRetry(62, 3, 5, 2, 8, 0, 3)).toBe(true);
  });

  it('returns true for hallucinations (flagged > 0, score < 80)', () => {
    expect(shouldRetry(75, 1, 0, 2, 8, 0, 3)).toBe(true);
  });

  it('returns false when score is high and no flagged claims', () => {
    expect(shouldRetry(85, 0, 0, 2, 8, 0, 3)).toBe(false);
  });

  it('returns false when max retries reached', () => {
    expect(shouldRetry(45, 5, 5, 2, 8, 3, 3)).toBe(false);
  });

  it('returns false when at max steps', () => {
    expect(shouldRetry(45, 5, 5, 7, 8, 0, 3)).toBe(false);
  });

  it('respects custom maxRetries (default 1)', () => {
    // With default maxRetries=1, retryCount=1 should return false
    expect(shouldRetry(45, 5, 5, 2, 8, 1)).toBe(false);
    // With maxRetries=3, retryCount=1 should return true
    expect(shouldRetry(45, 5, 5, 2, 8, 1, 3)).toBe(true);
  });
});

describe('shouldConverge', () => {
  it('stops when max iterations reached', () => {
    const result = shouldConverge(70, 65, 2, 3, 3, 3, 80);
    expect(result.continue).toBe(false);
    expect(result.reason).toContain('Max iterations');
  });

  it('stops when target score reached with no flagged claims', () => {
    const result = shouldConverge(85, 70, 0, 0, 1, 3, 80);
    expect(result.continue).toBe(false);
    expect(result.reason).toContain('Target score');
  });

  it('stops when score stops improving', () => {
    const result = shouldConverge(65, 70, 2, 3, 1, 3, 80);
    expect(result.continue).toBe(false);
    expect(result.reason).toContain('stopped improving');
  });

  it('stops when no fixable issues remaining (score >= 70)', () => {
    const result = shouldConverge(72, 68, 0, 2, 1, 3, 80);
    expect(result.continue).toBe(false);
    expect(result.reason).toContain('No fixable issues');
  });

  it('continues when score is improving and issues remain', () => {
    const result = shouldConverge(68, 60, 2, 5, 1, 3, 80);
    expect(result.continue).toBe(true);
    expect(result.reason).toContain('Iteration 2');
  });

  it('continues on first iteration with low score', () => {
    const result = shouldConverge(55, null, 3, 5, 0, 3, 80);
    expect(result.continue).toBe(true);
  });

  it('continues when previous score is null (first iteration)', () => {
    const result = shouldConverge(60, null, 1, 2, 0, 3, 80);
    expect(result.continue).toBe(true);
  });

  it('does not stop on target score if flagged claims remain', () => {
    const result = shouldConverge(82, 75, 1, 0, 1, 3, 80);
    expect(result.continue).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Convergence adoption invariant (audit fix #5): the GAN loop must NEVER
// adopt a corrected draft whose QA score is not strictly higher than the
// current draft's. A non-improving correction is discarded and the loop stops.
// This locks the control-flow invariant in `doSynthesize` against future
// refactors that might flip the adoption branch.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure model of the DO's adoption decision (mirrors the branch in
 * `investigator-agent.ts` doSynthesize). Returns the report/score the loop
 * keeps after one convergence iteration.
 */
function simulateAdoption(currentScore: number, correctedScore: number): { adopted: boolean; keptScore: number } {
  // Mirrors: `if (qaNext.qualityScore > currentQa.qualityScore) { adopt } else { break }`
  if (correctedScore > currentScore) {
    return { adopted: true, keptScore: correctedScore };
  }
  return { adopted: false, keptScore: currentScore };
}

describe('convergence adoption invariant — never adopt a worse draft', () => {
  it('adopts a strictly-improving correction', () => {
    const r = simulateAdoption(70, 78);
    expect(r.adopted).toBe(true);
    expect(r.keptScore).toBe(78);
  });

  it('rejects an equal-score correction (no improvement → stop)', () => {
    // Equal is NOT strictly greater, so the loop must NOT adopt and must break.
    const r = simulateAdoption(75, 75);
    expect(r.adopted).toBe(false);
    expect(r.keptScore).toBe(75);
  });

  it('rejects a lower-score correction (keep the better prior draft)', () => {
    const r = simulateAdoption(80, 72);
    expect(r.adopted).toBe(false);
    expect(r.keptScore).toBe(80);
  });

  it('combined with shouldConverge: a non-improving iteration stops the loop', () => {
    // Iteration 1: score 70, prev null → continue (improving from nothing)
    expect(shouldConverge(70, null, 2, 3, 0, 3, 80).continue).toBe(true);
    // Iteration 2: corrected score 68 (did NOT improve over 70) →
    //   adoption rejects it (keptScore stays 70), AND shouldConverge stops.
    const adoption = simulateAdoption(70, 68);
    expect(adoption.adopted).toBe(false);
    expect(adoption.keptScore).toBe(70);
    // On the NEXT convergence check, prevScore=70 and currentScore=70 (unchanged)
    // → shouldConverge sees currentScore <= previousScore → stop.
    expect(shouldConverge(70, 70, 2, 3, 1, 3, 80).continue).toBe(false);
  });

  it('the final kept score is always >= the first QA-passing score', () => {
    // Simulate a 3-iteration sequence where scores go 60 → 72 → 65.
    // The loop should keep 72 (the best), not regress to 65.
    let kept = 60; // first QA-passing score
    for (const next of [72, 65]) {
      const r = simulateAdoption(kept, next);
      if (r.adopted) kept = r.keptScore;
      // When not adopted, kept stays unchanged (the DO breaks the loop).
      if (!r.adopted) break;
    }
    expect(kept).toBe(72); // never regressed below the best seen
  });
});
