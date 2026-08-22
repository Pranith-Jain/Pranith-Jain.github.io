import { describe, it, expect, beforeEach } from 'vitest';
import { validateMitreIds, validateActorNames, detectContradictions } from '../../../src/lib/report/validator';
import { loadAttackIdIndex, _resetAttackIdIndexForTests } from '../../../src/lib/attack-id-lazy';

describe('validateMitreIds', () => {
  beforeEach(async () => {
    _resetAttackIdIndexForTests();
    // The index ships as a runtime asset (fetched via ASSETS) since the
    // bundled TS module was removed for the 3 MiB Worker size limit —
    // warm the memoised cache with a stubbed asset before validating.
    const env = {
      ASSETS: {
        fetch: async () =>
          new Response(
            JSON.stringify({
              T1047: { id: 'T1047', col: 'e' },
              T1566: { id: 'T1566', col: 'e' },
            }),
            { status: 200 }
          ),
      },
    };
    await loadAttackIdIndex(env as never);
  });

  it('keeps catalog IDs and drops unknown ones', async () => {
    const { valid, rejected } = validateMitreIds(['T1047', 'T9999']);
    expect(valid).toContain('T1047');
    expect(rejected).toContain('T9999');
  });
});

describe('validateActorNames', () => {
  it('confirms a known alias and rejects gibberish', () => {
    const { valid, rejected } = validateActorNames(['LockBit', 'zzqqx-not-an-actor']);
    expect(valid.length).toBe(1);
    expect(rejected).toContain('zzqqx-not-an-actor');
  });
});

describe('detectContradictions', () => {
  it('flags two sources giving different ransom figures for the same victim', () => {
    const conflicts = detectContradictions([
      { sourceId: 'a', claimKey: 'ransom:acme', value: '1000000' },
      { sourceId: 'b', claimKey: 'ransom:acme', value: '2000000' },
      { sourceId: 'c', claimKey: 'ransom:beta', value: '500000' },
    ]);
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    expect(conflict).toBeDefined();
    expect(conflict!.claim).toBe('ransom:acme');
    expect(conflict!.positions.sort()).toEqual(['1000000', '2000000']);
  });
  it('returns nothing when sources agree', () => {
    expect(
      detectContradictions([
        { sourceId: 'a', claimKey: 'k', value: 'x' },
        { sourceId: 'b', claimKey: 'k', value: 'x' },
      ])
    ).toHaveLength(0);
  });
});
