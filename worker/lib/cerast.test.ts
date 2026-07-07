import { describe, it, expect } from 'vitest';
import { cerastSearch, isValidCerastQuery } from './cerast';

describe('isValidCerastQuery', () => {
  it('rejects queries shorter than 3 chars', () => {
    expect(isValidCerastQuery('ab')).toBe(false);
    expect(isValidCerastQuery('')).toBe(false);
  });
  it('accepts valid queries', () => {
    expect(isValidCerastQuery('abc')).toBe(true);
    expect(isValidCerastQuery('staging.')).toBe(true);
    expect(isValidCerastQuery('  abc  ')).toBe(true);
  });
});

describe('cerastSearch', () => {
  it('returns error for short query', async () => {
    const r = await cerastSearch('ab');
    expect(r.diagnostics[0]?.status).toBe('failed');
    expect(r.results).toHaveLength(0);
  });

  it('performs a real search for staging.', async () => {
    const r = await cerastSearch('staging.');
    expect(r.diagnostics[0]?.status).toBe('ok');
    expect(Array.isArray(r.results)).toBe(true);
    expect(typeof r.count).toBe('number');
  }, 15000);

  it('returns empty results for nonsense query', async () => {
    const r = await cerastSearch('xyzzyzzz999');
    expect(r.diagnostics[0]?.status).toBe('ok');
    expect(r.results).toHaveLength(0);
  }, 15000);
});
