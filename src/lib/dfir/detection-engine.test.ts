/**
 * The client-side detection engine is a verbatim mirror of
 * `api/src/lib/detection-engine.ts`. The API version has its own thorough
 * test suite; this file is a drift-detector that confirms the two copies
 * behave identically on the same inputs. If a future edit drifts one
 * copy from the other, these tests fail before the bug ships.
 */

import { describe, it, expect } from 'vitest';
import { evaluateRules, type DetectionRule, type EngineIndicator } from './detection-engine';

const ioc = (p: Partial<EngineIndicator> & Pick<EngineIndicator, 'value' | 'kind' | 'source'>): EngineIndicator => ({
  ...p,
});

describe('client-side evaluateRules (mirror of api/src/lib/detection-engine)', () => {
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
      ioc({ value: '9.9.9.9', kind: 'ip', source: 'feed-a' }), // dup source
      ioc({ value: '8.8.8.8', kind: 'ip', source: 'feed-a' }),
    ];
    const { detections } = evaluateRules([rule], items);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.group_key).toBe('9.9.9.9');
    expect(detections[0]!.match_count).toBe(2);
  });

  it('reports a warning + skips rule on invalid regex', () => {
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
});
