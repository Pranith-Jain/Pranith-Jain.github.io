import { describe, expect, it } from 'vitest';
import { dedupRansomwareVictims } from './dedup-ransomware';

describe('dedupRansomwareVictims', () => {
  it('collapses same-day (group, victim) duplicates into one row', () => {
    const result = dedupRansomwareVictims([
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-04T10:00:00Z' },
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-04T18:00:00Z' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('keeps the earliest discovery date when the same victim appears on multiple days', () => {
    const result = dedupRansomwareVictims([
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-05T08:00:00Z' },
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-04T08:00:00Z' },
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-06T08:00:00Z' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].discovered).toBe('2026-06-04T08:00:00Z');
  });

  it('treats different victims as distinct even if the group matches', () => {
    const result = dedupRansomwareVictims([
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-04T10:00:00Z' },
      { group: 'akira', victim: 'Globex', discovered: '2026-06-04T11:00:00Z' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('treats different groups as distinct even if the victim matches', () => {
    const result = dedupRansomwareVictims([
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-04T10:00:00Z' },
      { group: 'qilin', victim: 'Acme Corp', discovered: '2026-06-04T11:00:00Z' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('is case-insensitive on both group and victim', () => {
    const result = dedupRansomwareVictims([
      { group: 'Akira', victim: 'ACME CORP', discovered: '2026-06-04T10:00:00Z' },
      { group: 'akira', victim: 'acme corp', discovered: '2026-06-05T10:00:00Z' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].discovered).toBe('2026-06-04T10:00:00Z');
  });

  it('drops rows missing group or victim (would otherwise inflate counts)', () => {
    const result = dedupRansomwareVictims([
      { group: '', victim: 'Acme Corp', discovered: '2026-06-04T10:00:00Z' },
      { group: 'akira', victim: '', discovered: '2026-06-04T10:00:00Z' },
      { group: 'akira', victim: 'Globex', discovered: '2026-06-04T10:00:00Z' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].victim).toBe('Globex');
  });

  it('keeps a row with unparseable date when no other row for the same key exists', () => {
    const result = dedupRansomwareVictims([{ group: 'akira', victim: 'Acme Corp', discovered: 'not-a-date' }]);
    expect(result).toHaveLength(1);
    expect(result[0].discovered).toBe('not-a-date');
  });

  it('prefers a parseable date over an unparseable one for the same key', () => {
    const result = dedupRansomwareVictims([
      { group: 'akira', victim: 'Acme Corp', discovered: 'not-a-date' },
      { group: 'akira', victim: 'Acme Corp', discovered: '2026-06-04T10:00:00Z' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].discovered).toBe('2026-06-04T10:00:00Z');
  });

  it('handles an empty / missing input without throwing', () => {
    expect(dedupRansomwareVictims([])).toEqual([]);
    expect(dedupRansomwareVictims(undefined as unknown as never)).toEqual([]);
    expect(dedupRansomwareVictims(null as unknown as never)).toEqual([]);
  });
});
