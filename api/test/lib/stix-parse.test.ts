import { describe, it, expect } from 'vitest';
import { parseStixBundle, parseStixPattern } from '../../src/lib/stix-parse';

const SAMPLE_BUNDLE = {
  type: 'bundle',
  id: 'bundle--abc',
  objects: [
    {
      type: 'intrusion-set',
      id: 'intrusion-set--1',
      name: 'APT-ShadowByte',
      aliases: ['ShadowByte', 'FinancialHunter'],
      primary_motivation: 'Financial gain',
    },
    {
      type: 'campaign',
      id: 'campaign--1',
      name: 'Operation ShadowByte',
      description: 'Financial sector targeted',
      first_seen: '2024-01-15T00:00:00Z',
    },
    {
      type: 'attack-pattern',
      id: 'attack-pattern--1',
      name: 'Spear-phishing Attachment',
      external_references: [{ source_name: 'mitre-attack', external_id: 'T1566.001' }],
    },
    {
      type: 'indicator',
      id: 'indicator--1',
      pattern: "[ipv4-addr:value = '192.168.1.100']",
      labels: ['malicious-activity'],
    },
    {
      type: 'relationship',
      id: 'rel--1',
      source_ref: 'campaign--1',
      target_ref: 'intrusion-set--1',
      relationship_type: 'attributed-to',
    },
  ],
};

describe('parseStixPattern', () => {
  it('parses ipv4 pattern', () => {
    expect(parseStixPattern("[ipv4-addr:value = '192.168.1.100']")).toEqual({ type: 'ipv4', value: '192.168.1.100' });
  });
  it('parses domain pattern', () => {
    expect(parseStixPattern("[domain-name:value = 'evil.com']")).toEqual({ type: 'domain', value: 'evil.com' });
  });
  it('parses hash pattern (SHA256 / MD5 / SHA-1)', () => {
    expect(parseStixPattern("[file:hashes.'SHA-256' = 'abc123']")).toEqual({ type: 'hash', value: 'abc123' });
    expect(parseStixPattern("[file:hashes.MD5 = '5d41402abc4b2a76b9719d911017c592']")).toEqual({
      type: 'hash',
      value: '5d41402abc4b2a76b9719d911017c592',
    });
  });
  it('parses url pattern', () => {
    expect(parseStixPattern("[url:value = 'http://evil.com/payload']")).toEqual({
      type: 'url',
      value: 'http://evil.com/payload',
    });
  });
  it('parses email pattern', () => {
    expect(parseStixPattern("[email-addr:value = 'a@b.com']")).toEqual({ type: 'email', value: 'a@b.com' });
  });
  it('returns unknown for unparseable', () => {
    expect(parseStixPattern("[weird-thing:foo = 'bar']")).toEqual({ type: 'unknown', value: 'bar' });
  });
});

describe('parseStixBundle', () => {
  it('extracts actors, campaigns, attack patterns, indicators', () => {
    const r = parseStixBundle(SAMPLE_BUNDLE);
    expect(r.actors).toHaveLength(1);
    expect(r.actors[0].name).toBe('APT-ShadowByte');
    expect(r.actors[0].aliases).toEqual(['ShadowByte', 'FinancialHunter']);
    expect(r.campaigns).toHaveLength(1);
    expect(r.campaigns[0].actor_id).toBe('intrusion-set--1');
    expect(r.attack_patterns).toHaveLength(1);
    expect(r.attack_patterns[0].mitre_id).toBe('T1566.001');
    expect(r.indicators).toHaveLength(1);
    expect(r.indicators[0].type).toBe('ipv4');
    expect(r.indicators[0].value).toBe('192.168.1.100');
  });

  it('handles empty/malformed bundle', () => {
    const r = parseStixBundle({ type: 'bundle', id: 'b', objects: [] });
    expect(r.actors).toEqual([]);
  });

  it('rejects non-bundle input', () => {
    expect(() => parseStixBundle({ type: 'not-a-bundle' } as never)).toThrow();
  });

  it('rejects bundles with > 1000 objects', () => {
    const objs = Array.from({ length: 1001 }, (_, i) => ({
      type: 'indicator',
      id: `i--${i}`,
      pattern: "[ipv4-addr:value = '1.2.3.4']",
      labels: [],
    }));
    expect(() => parseStixBundle({ type: 'bundle', id: 'b', objects: objs as never })).toThrow(/too large/);
  });

  it('treats overlong patterns as unknown', () => {
    const long = "[ipv4-addr:value = '" + 'x'.repeat(600) + "']";
    expect(parseStixPattern(long).type).toBe('unknown');
  });
});
