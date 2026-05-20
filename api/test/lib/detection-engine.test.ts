import { describe, it, expect } from 'vitest';
import { evaluateRules, type DetectionRule, type EngineIndicator } from '../../src/lib/detection-engine';

const ioc = (p: Partial<EngineIndicator> & Pick<EngineIndicator, 'value' | 'kind' | 'source'>): EngineIndicator => ({
  ...p,
});

describe('evaluateRules', () => {
  it('fires a flat rule when minMatches is reached', () => {
    const rule: DetectionRule = {
      id: 'c2',
      name: 'C2',
      severity: 'high',
      match: { contextRegex: 'cobalt[ -]?strike' },
      minMatches: 1,
    };
    const items = [
      ioc({ value: '1.2.3.4', kind: 'ip', source: 'c2-intel', context: 'Cobalt Strike beacon' }),
      ioc({ value: '5.6.7.8', kind: 'ip', source: 'sans-isc', context: 'ssh bruteforce' }),
    ];
    const { detections } = evaluateRules([rule], items);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.match_count).toBe(1);
    expect(detections[0]!.indicators[0]!.value).toBe('1.2.3.4');
  });

  it('does not fire a flat rule below minMatches', () => {
    const rule: DetectionRule = {
      id: 'r',
      name: 'r',
      severity: 'low',
      match: { kind: 'hash' },
      minMatches: 3,
    };
    const items = [ioc({ value: 'abc', kind: 'hash', source: 'mb' })];
    expect(evaluateRules([rule], items).detections).toHaveLength(0);
  });

  it('aggregates cross-feed consensus by distinct source', () => {
    const rule: DetectionRule = {
      id: 'consensus',
      name: 'consensus',
      severity: 'high',
      match: { kind: 'ip' },
      aggregate: { groupBy: 'value', minCount: 2, distinctBy: 'source' },
    };
    const items = [
      ioc({ value: '9.9.9.9', kind: 'ip', source: 'feed-a' }),
      ioc({ value: '9.9.9.9', kind: 'ip', source: 'feed-b' }),
      ioc({ value: '9.9.9.9', kind: 'ip', source: 'feed-a' }), // duplicate source — not counted twice
      ioc({ value: '8.8.8.8', kind: 'ip', source: 'feed-a' }), // only one source — no consensus
    ];
    const { detections } = evaluateRules([rule], items);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.group_key).toBe('9.9.9.9');
    expect(detections[0]!.match_count).toBe(2);
  });

  it('skips empty group keys', () => {
    const rule: DetectionRule = {
      id: 'g',
      name: 'g',
      severity: 'low',
      match: {},
      aggregate: { groupBy: 'context', minCount: 1 },
    };
    const items = [ioc({ value: 'x', kind: 'ip', source: 's' })]; // no context
    expect(evaluateRules([rule], items).detections).toHaveLength(0);
  });

  it('reports a warning for an invalid regex and skips the rule', () => {
    const rule: DetectionRule = {
      id: 'bad',
      name: 'bad',
      severity: 'low',
      match: { valueRegex: '(' },
    };
    const items = [ioc({ value: 'x', kind: 'ip', source: 's' })];
    const { detections, warnings } = evaluateRules([rule], items);
    expect(detections).toHaveLength(0);
    expect(warnings[0]!.rule_id).toBe('bad');
    expect(warnings[0]!.message).toMatch(/invalid value regex/);
  });

  it('honours enabled:false', () => {
    const rule: DetectionRule = {
      id: 'off',
      name: 'off',
      severity: 'low',
      enabled: false,
      match: { kind: 'ip' },
    };
    expect(evaluateRules([rule], [ioc({ value: 'x', kind: 'ip', source: 's' })]).detections).toHaveLength(0);
  });

  it('sorts detections by severity then match_count', () => {
    const items = [
      ioc({ value: 'a', kind: 'ip', source: 's', context: 'lockbit ransomware' }),
      ioc({ value: 'b', kind: 'ip', source: 's', context: 'lockbit ransomware' }),
      ioc({ value: 'c', kind: 'ip', source: 's', context: 'scan' }),
    ];
    const rules: DetectionRule[] = [
      { id: 'low', name: 'low', severity: 'low', match: { kind: 'ip' } },
      { id: 'crit', name: 'crit', severity: 'critical', match: { contextRegex: 'ransomware' } },
    ];
    const { detections } = evaluateRules(rules, items);
    expect(detections[0]!.severity).toBe('critical');
    expect(detections[1]!.severity).toBe('low');
  });
});
