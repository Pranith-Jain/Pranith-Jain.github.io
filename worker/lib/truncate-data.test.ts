import { describe, it, expect } from 'vitest';
import { truncateData } from './truncate-data';

/**
 * Regression gate for the structure-aware truncateData (audit fix #2).
 *
 * The previous implementation did `json.slice(0, maxChars)` then
 * `JSON.parse(truncated)` — which almost always threw on mid-string cuts,
 * replacing large tool results with a `{ _truncated, _preview }` stub. These
 * tests pin the new contract: the output is ALWAYS valid JSON (round-trips
 * through JSON.stringify/parse) and stays within the budget.
 */
describe('truncateData', () => {
  it('returns data unchanged when it fits the budget', () => {
    const data = { a: 1, b: 2 };
    expect(truncateData(data, 1000)).toEqual(data);
  });

  it('returns data unchanged at exactly the budget boundary', () => {
    const data = { a: 1 };
    const json = JSON.stringify(data);
    expect(truncateData(data, json.length)).toEqual(data);
  });

  it('truncates an object by dropping trailing keys (never mid-string)', () => {
    const data = { keep: 'short', drop1: 'x'.repeat(500), drop2: 'y'.repeat(500) };
    const out = truncateData(data, 60) as Record<string, unknown>;
    // Output must be valid JSON (round-trips).
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    // Must fit the budget.
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(60);
    // Must keep the short key and record what was dropped.
    expect(out.keep).toBe('short');
    expect(Array.isArray(out._truncated_keys)).toBe(true);
    expect(out._truncated_keys).toContain('drop1');
    expect(out._truncated_keys).toContain('drop2');
  });

  it('truncates an array by wrapping kept entries with a truncation marker', () => {
    const data = ['keep', 'x'.repeat(200), 'y'.repeat(200)];
    // Budget 60 fits {"_truncated_array":["keep"],"_truncated_entries":2} (52 chars)
    // but not the 2-entry wrapper (255 chars), so exactly one entry is kept.
    const out = truncateData(data, 60) as { _truncated_array: unknown[]; _truncated_entries: number };
    // Output must be valid JSON (round-trips) — named props on the wrapper
    // survive serialization (unlike named props on a bare array).
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(60);
    expect(out._truncated_array[0]).toBe('keep');
    expect(out._truncated_entries).toBeGreaterThan(0);
  });

  it('NEVER returns mid-string-sliced JSON — output always round-trips', () => {
    // A long string value that would be cut mid-token by naive slicing.
    const data = { url: 'https://example.com/' + 'a'.repeat(300) };
    const out = truncateData(data, 40);
    // The result must be JSON-parseable (no dangling quotes/braces).
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(40);
  });

  it('returns an explicit stub for a single huge primitive, within budget', () => {
    const data = 'x'.repeat(5000);
    const out = truncateData(data, 200) as Record<string, unknown>;
    expect(out._truncated).toBe(true);
    expect(out._original_chars).toBe(5002); // 5000 + 2 quotes
    expect(typeof out._summary).toBe('string');
    // The WHOLE stub must fit the budget (including its fixed fields).
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(200);
  });

  it('returns a keys-dropped marker for an object whose every key is huge', () => {
    const data = { a: 'x'.repeat(500), b: 'y'.repeat(500) };
    const out = truncateData(data, 40) as Record<string, unknown>;
    // Every key was too big to keep, so only the _truncated_keys marker remains.
    expect(Array.isArray(out._truncated_keys)).toBe(true);
    expect(out._truncated_keys).toContain('a');
    expect(out._truncated_keys).toContain('b');
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(40);
    // Still valid JSON (round-trips).
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('handles empty objects and arrays', () => {
    expect(truncateData({}, 100)).toEqual({});
    // An empty array fits, so it's returned unchanged.
    expect(truncateData([], 100)).toEqual([]);
  });

  it('handles null and primitives that fit', () => {
    expect(truncateData(null, 100)).toBeNull();
    expect(truncateData(42, 100)).toBe(42);
    expect(truncateData('short', 100)).toBe('short');
  });

  it('a huge primitive stub at a small budget fits within the budget', () => {
    const data = 'x'.repeat(5000);
    // 80 chars fits the empty-summary stub (56) with room for ~24 chars of summary.
    const out = truncateData(data, 80) as Record<string, unknown>;
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(80);
    expect(out._truncated).toBe(true);
  });

  it('at an infeasibly tiny budget, still returns valid JSON (stub may exceed budget)', () => {
    // The stub's own fixed fields (56 chars) can't fit a 20-char budget.
    // The function returns the stub anyway (the smallest meaningful truncation
    // signal) rather than a malformed slice. The contract is: output is ALWAYS
    // valid JSON; the budget is best-effort for the structural path.
    const data = 'x'.repeat(5000);
    const out = truncateData(data, 20) as Record<string, unknown>;
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
    expect(out._truncated).toBe(true);
    expect(out._summary).toBe(''); // summary budget clamped to 0
  });
});
