import { describe, it, expect } from 'vitest';
import { DETECTION_RULES_PACK } from '../../src/lib/detection-rules-pack';
import { evaluateRules, type EngineIndicator } from '../../src/lib/detection-engine';

/**
 * Structural sanity checks on the curated rule pack. These guard against
 * paste errors that wouldn't fail a typecheck: invalid severity strings,
 * duplicated rule IDs, bad regexes, and unknown groupBy values.
 */
describe('DETECTION_RULES_PACK structure', () => {
  it('every rule has a unique id', () => {
    const ids = DETECTION_RULES_PACK.map((r) => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every rule has a non-empty name and id', () => {
    for (const r of DETECTION_RULES_PACK) {
      expect(r.id).toMatch(/^[a-z0-9-]+$/);
      expect(r.name.length).toBeGreaterThan(3);
    }
  });

  it('severity is one of the canonical values', () => {
    const allowed = new Set(['critical', 'high', 'medium', 'low', 'info']);
    for (const r of DETECTION_RULES_PACK) expect(allowed.has(r.severity)).toBe(true);
  });

  it('every regex compiles without throwing', () => {
    for (const r of DETECTION_RULES_PACK) {
      if (r.match.valueRegex) expect(() => new RegExp(r.match.valueRegex!, 'i')).not.toThrow();
      if (r.match.contextRegex) expect(() => new RegExp(r.match.contextRegex!, 'i')).not.toThrow();
      if (r.match.reporterRegex) expect(() => new RegExp(r.match.reporterRegex!, 'i')).not.toThrow();
    }
  });

  it('aggregate groupBy uses canonical fields', () => {
    const allowed = new Set(['value', 'source', 'reporter', 'kind', 'context']);
    for (const r of DETECTION_RULES_PACK) {
      if (r.aggregate) expect(allowed.has(r.aggregate.groupBy)).toBe(true);
    }
  });

  it('rules with kind constraint use only canonical IOC kinds', () => {
    const allowed = new Set(['ip', 'url', 'domain', 'hash']);
    for (const r of DETECTION_RULES_PACK) {
      const kinds = Array.isArray(r.match.kind) ? r.match.kind : r.match.kind ? [r.match.kind] : [];
      for (const k of kinds) expect(allowed.has(k)).toBe(true);
    }
  });
});

describe('DETECTION_RULES_PACK semantics', () => {
  it('does not fire on an empty indicator set', () => {
    const { detections } = evaluateRules(DETECTION_RULES_PACK, []);
    expect(detections).toEqual([]);
  });

  it('fires expected rules on a representative IP-in-three-feeds case', () => {
    const items: EngineIndicator[] = [
      { value: '203.0.113.10', kind: 'ip', source: 'c2-intel', reporter: 'drb-ra', context: 'cobalt strike' },
      { value: '203.0.113.10', kind: 'ip', source: 'sans-isc', reporter: 'ISC sensor network', context: 'ssh' },
      { value: '203.0.113.10', kind: 'ip', source: 'otx-reputation', reporter: 'AlienVault OTX', context: 'malicious' },
    ];
    const { detections } = evaluateRules(DETECTION_RULES_PACK, items);
    // Should at least catch the cross-feed-consensus rule and the C2 contextRegex rule.
    const ruleIds = detections.map((d) => d.rule_id);
    expect(ruleIds).toContain('ip-cross-feed-consensus');
    expect(ruleIds).toContain('cobalt-strike-c2');
  });

  it('fires the ransomware-tag rule on a context containing "lockbit"', () => {
    const items: EngineIndicator[] = [
      { value: 'evilhost.example', kind: 'domain', source: 'threatfox', context: 'lockbit infrastructure' },
    ];
    const { detections } = evaluateRules(DETECTION_RULES_PACK, items);
    expect(detections.map((d) => d.rule_id)).toContain('ransomware-tagged-indicator');
  });

  it('does NOT misfire the low-severity slate rule with a green-looking benign context', () => {
    // Sanity check: a "patched" CVE context shouldn't trigger ransomware/c2 etc.
    const items: EngineIndicator[] = [{ value: '198.51.100.5', kind: 'ip', source: 'sans-isc', context: 'patched' }];
    const { detections } = evaluateRules(DETECTION_RULES_PACK, items);
    const triggered = detections.map((d) => d.rule_id);
    expect(triggered).not.toContain('cobalt-strike-c2');
    expect(triggered).not.toContain('ransomware-tagged-indicator');
  });
});
