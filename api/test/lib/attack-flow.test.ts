import { describe, it, expect } from 'vitest';
import {
  orderByTactic,
  buildAttackFlowObjects,
  TACTIC_ORDER,
  ATTACK_FLOW_EXT_ID,
  type FlowTechnique,
} from '../../src/lib/attack-flow';

// Deterministic fake id factory: `${type}--${sha-ish of key}` — here just type+key.
const fakeIdFor = async (type: string, key: string) =>
  `${type}--${key
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 8)
    .padEnd(8, '0')}`;
const TIME = { created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' };

describe('orderByTactic', () => {
  it('orders by kill-chain phase, unknown tactics last, id tiebreak', () => {
    const techs: FlowTechnique[] = [
      { id: 'T1486', name: 'Impact tech', stixApId: 'attack-pattern--c', tactic: 'impact' },
      { id: 'T1566', name: 'Phish', stixApId: 'attack-pattern--a', tactic: 'initial-access' },
      { id: 'T9999', name: 'Unknown', stixApId: 'attack-pattern--z' }, // no tactic, not in index
      { id: 'T1059', name: 'Exec', stixApId: 'attack-pattern--b', tactic: 'execution' },
    ];
    const out = orderByTactic(techs).map((t) => t.id);
    expect(out).toEqual(['T1566', 'T1059', 'T1486', 'T9999']);
  });

  it('is pure (does not mutate input)', () => {
    const techs: FlowTechnique[] = [
      { id: 'T1486', name: 'a', stixApId: 'x', tactic: 'impact' },
      { id: 'T1566', name: 'b', stixApId: 'y', tactic: 'initial-access' },
    ];
    const copy = [...techs];
    orderByTactic(techs);
    expect(techs).toEqual(copy);
  });
});

describe('buildAttackFlowObjects', () => {
  const opts = {
    flowName: 'Attack Flow — Test',
    identityId: 'identity--id',
    time: TIME,
    keyPrefix: 'upload|sha256:abc',
    idFor: fakeIdFor,
    scope: 'incident',
  };

  it('returns empty for no techniques', async () => {
    const r = await buildAttackFlowObjects([], opts);
    expect(r.objects).toEqual([]);
    expect(r.flowId).toBeNull();
    expect(r.startRef).toBeNull();
  });

  it('builds extension-definition + attack-flow + linear attack-actions', async () => {
    const ordered: FlowTechnique[] = [
      { id: 'T1566', name: 'Phish', stixApId: 'attack-pattern--a', tactic: 'initial-access' },
      { id: 'T1059', name: 'Exec', stixApId: 'attack-pattern--b', tactic: 'execution' },
    ];
    const r = await buildAttackFlowObjects(ordered, opts);
    const types = r.objects.map((o) => o.type);
    expect(types).toContain('extension-definition');
    expect(types.filter((t) => t === 'attack-flow')).toHaveLength(1);
    expect(types.filter((t) => t === 'attack-action')).toHaveLength(2);

    const extDef = r.objects.find((o) => o.type === 'extension-definition')!;
    expect(extDef.id).toBe(ATTACK_FLOW_EXT_ID);
    expect((extDef as any).extension_types).toEqual(['new-sdo']);

    const flow = r.objects.find((o) => o.type === 'attack-flow')! as any;
    expect(flow.scope).toBe('incident');
    expect(flow.start_refs).toEqual([r.startRef]);
    expect(flow.extensions[ATTACK_FLOW_EXT_ID]).toEqual({ extension_type: 'new-sdo' });

    const actions = r.objects.filter((o) => o.type === 'attack-action') as any[];
    // First action is the start; its effect_refs points to the second; last has none.
    expect(actions[0].id).toBe(r.startRef);
    expect(actions[0].technique_id).toBe('T1566');
    expect(actions[0].technique_ref).toBe('attack-pattern--a');
    expect(actions[0].effect_refs).toEqual([actions[1].id]);
    expect(actions[1].effect_refs).toBeUndefined();
    // every attack-flow SDO carries the extension marker
    for (const a of actions) expect(a.extensions[ATTACK_FLOW_EXT_ID]).toEqual({ extension_type: 'new-sdo' });
  });
});
