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
