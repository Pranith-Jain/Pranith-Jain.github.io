import { describe, it, expect } from 'vitest';
import { activeRunnerNames } from '../../../src/case-study/discovery/rotation';

const ALL = [
  'cve',
  'vulncheck',
  'actor',
  'ransom',
  'platform',
  'malware',
  'breach',
  'scam',
  'aisec',
  'intel',
  'advisories',
  'euvd',
  'releak',
  'briefing',
];
const ALWAYS = new Set(['cve', 'vulncheck', 'actor', 'ransom', 'platform']);

describe('activeRunnerNames', () => {
  it('always includes the always-on runners', () => {
    const a = activeRunnerNames(ALL, ALWAYS, new Date('2026-06-04T00:00:00Z'), 3);
    for (const k of ALWAYS) expect(a).toContain(k);
  });

  it('rotates the optional runners across days (different days → different subsets)', () => {
    const d1 = activeRunnerNames(ALL, ALWAYS, new Date('2026-06-04T00:00:00Z'), 3);
    const d2 = activeRunnerNames(ALL, ALWAYS, new Date('2026-06-05T00:00:00Z'), 3);
    expect(d1).not.toEqual(d2);
  });

  it('every optional runner appears within `groups` consecutive days', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const day = new Date(Date.UTC(2026, 5, 4 + i));
      for (const n of activeRunnerNames(ALL, ALWAYS, day, 3)) seen.add(n);
    }
    for (const n of ALL) expect(seen.has(n)).toBe(true);
  });
});
