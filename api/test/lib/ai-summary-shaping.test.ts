/**
 * Unit tests for the ai-summary shaping pass (dedup → rank → tiered budget).
 *
 * Pure functions, no LLM — offline + deterministic.
 *
 * Run locally (sandbox disabled) per docs/loops/api-tests-unsandboxed.md:
 *   npx vitest run test/lib/ai-summary-shaping.test.ts
 */

import { describe, it, expect } from 'vitest';
import { normalizeTitle, scoreItem, shapeItemsForPrompt } from '../../src/lib/ai-summary';

describe('normalizeTitle', () => {
  it('folds case and punctuation so syndicated copies match', () => {
    expect(normalizeTitle('LockBit 3.0 Hits Hospitals!')).toBe('lockbit 3 0 hits hospitals');
    expect(normalizeTitle('  lockbit-3.0  hits   hospitals ')).toBe('lockbit 3 0 hits hospitals');
  });

  it('returns empty for title-free items', () => {
    expect(normalizeTitle('')).toBe('');
    expect(normalizeTitle('!!!')).toBe('');
  });
});

describe('scoreItem', () => {
  it('rewards CVE mentions above generic items', () => {
    const cve = scoreItem('Edge RCE CVE-2026-1234 exploited', 'remote code execution in the wild');
    const generic = scoreItem('Weekly security newsletter', 'a roundup of this week in security news and blog posts');
    expect(cve).toBeGreaterThan(generic);
    expect(cve).toBeGreaterThanOrEqual(3);
  });

  it('caps signal-keyword points at 3', () => {
    const many = scoreItem('ransomware breach leak apt 0-day exploit c2 kev critical', 'x'.repeat(200));
    const few = scoreItem('ransomware breach', 'x'.repeat(200));
    // many signals (6+) capped at 3; few signals (2) uncapped at 2 → diff is exactly 1
    expect(many - few).toBe(1);
  });

  it('rewards substantive bodies over title-only stubs', () => {
    expect(scoreItem('Same title', 'x'.repeat(200))).toBe(scoreItem('Same title', 'short') + 1);
  });
});

describe('shapeItemsForPrompt', () => {
  const items = [
    { title: 'Weekly roundup', body: 'news '.repeat(50) },
    { title: 'LockBit hits hospitals', body: 'ransomware breach leak details '.repeat(20) },
    { title: 'LOCKBIT hits hospitals!!', body: 'duplicate syndicated copy' },
    { title: 'Edge RCE CVE-2026-1234 exploited in the wild', body: 'critical 0-day rce '.repeat(30) },
    { title: '', body: 'no title — dropped' },
  ];

  it('dedups normalized titles and drops empty titles', () => {
    const { items: shaped, dupesRemoved } = shapeItemsForPrompt(items);
    expect(dupesRemoved).toBe(2);
    expect(shaped.map((s) => s.title)).not.toContain('LOCKBIT hits hospitals!!');
    expect(shaped.map((s) => s.title)).not.toContain('');
  });

  it('ranks the CVE item first and keeps rank order stable on ties', () => {
    const { items: shaped } = shapeItemsForPrompt(items);
    expect(shaped[0]!.title).toContain('CVE-2026-1234');
    expect(shaped[0]!.rank).toBe(0);
    // ranks are dense 0..n-1 in output order
    expect(shaped.map((s) => s.rank)).toEqual([0, 1, 2]);
  });

  it('tiers body budgets: top-10 get 600 chars, tail gets 250', () => {
    const bulk = Array.from({ length: 15 }, (_, i) => ({
      title: `Item ${i} ${i === 0 ? 'CVE-2026-0001 critical rce exploit' : 'news'}`,
      body: 'x'.repeat(1000),
    }));
    const { items: shaped } = shapeItemsForPrompt(bulk);
    expect(shaped).toHaveLength(15);
    expect(shaped.slice(0, 10).every((s) => s.budget === 600)).toBe(true);
    expect(shaped.slice(10).every((s) => s.budget === 250)).toBe(true);
  });

  it('respects maxItems', () => {
    const bulk = Array.from({ length: 50 }, (_, i) => ({ title: `Story ${i}`, body: 'body' }));
    expect(shapeItemsForPrompt(bulk, 30).items).toHaveLength(30);
    expect(shapeItemsForPrompt(bulk, 5).items).toHaveLength(5);
  });

  it('gives single-report inputs a deep-read budget', () => {
    const { items: shaped } = shapeItemsForPrompt([{ title: 'Lazarus report', body: 'x'.repeat(5000) }]);
    expect(shaped).toHaveLength(1);
    expect(shaped[0]!.budget).toBe(3500);
  });
});
