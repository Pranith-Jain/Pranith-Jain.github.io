import { describe, it, expect } from 'vitest';
import { summarizeToolResult, describeTools } from '../../src/lib/agent/tools';
import type { AgentTool } from '../../src/lib/agent/types';

// ─────────────────────────────────────────────────────────────────────────────
// summarizeToolResult — observation contract tests.
//
// The agent-harness observation contract requires that tool results fed to
// the observer carry a one-line summary + key fields, NOT a raw JSON blob
// truncated mid-array. These tests pin the per-tool extractors so a regression
// to the old `JSON.stringify().slice()` behaviour is caught.
// ─────────────────────────────────────────────────────────────────────────────

describe('summarizeToolResult — per-tool structured extraction', () => {
  it('extracts verdict + score + provider count for check_ioc', () => {
    const data = {
      verdict: 'malicious',
      score: 87,
      malicious: true,
      asn: 'AS12345',
      country: 'RU',
      providers: [{ name: 'vt' }, { name: 'abuseipdb' }, { name: 'shodan' }],
    };
    const out = summarizeToolResult('check_ioc', data, 2000);
    expect(out).toContain('verdict=malicious');
    expect(out).toContain('score=87');
    expect(out).toContain('malicious=true');
    expect(out).toContain('asn=AS12345');
    expect(out).toContain('geo=RU');
    expect(out).toContain('providers=3');
    // Must NOT be a raw JSON dump starting with '{'
    expect(out.startsWith('{')).toBe(false);
  });

  it('extracts KEV + CVSS + EPSS for lookup_cve', () => {
    const data = {
      kev: true,
      cvss: { score: 9.8, vector: 'AV:N/AC:L' },
      epss: { score: 0.95, percentile: 0.99 },
      exploit_status: 'in-the-wild',
      threat_actors: ['APT29', 'APT41'],
    };
    const out = summarizeToolResult('lookup_cve', data);
    expect(out).toContain('kev=listed');
    expect(out).toContain('cvss=9.8');
    expect(out).toContain('epss=0.95');
    expect(out).toContain('exploit=in-the-wild');
    expect(out).toContain('actors=2');
  });

  it('extracts actor + malware + mitre counts for enrich_actor', () => {
    const data = {
      name: 'APT29',
      aliases: ['Cozy Bear', 'Nobelium'],
      malware: ['Sunburst', 'SUNSPOT'],
      mitre: ['T1071', 'T1547'],
    };
    const out = summarizeToolResult('enrich_actor', data);
    expect(out).toContain('actor=APT29');
    expect(out).toContain('malware=2');
    expect(out).toContain('mitre=2');
    expect(out).toContain('aliases=2');
  });

  it('extracts domain + records count for lookup_domain', () => {
    const data = {
      domain: 'evil.example.com',
      registrar: 'Njalla',
      created: '2024-01-15',
      records: [{ type: 'A' }, { type: 'MX' }, { type: 'TXT' }],
    };
    const out = summarizeToolResult('lookup_domain', data);
    expect(out).toContain('domain=evil.example.com');
    expect(out).toContain('registrar=Njalla');
    expect(out).toContain('created=2024-01-15');
    expect(out).toContain('records=3');
  });

  it('extracts verdict + detection count for sample_scan', () => {
    const data = {
      verdict: 'malicious',
      malicious: true,
      detections: [
        { engine: 'Kaspersky', result: 'trojan' },
        { engine: 'ESET', result: 'trojan' },
      ],
    };
    const out = summarizeToolResult('sample_scan', data);
    expect(out).toContain('verdict=malicious');
    expect(out).toContain('malicious=true');
    expect(out).toContain('detections=2');
  });

  it('extracts result count + top title for unified_search', () => {
    const data = {
      items: [{ title: 'APT29 targets SolarWinds supply chain' }, { title: 'Cozy Bear campaign analysis' }],
      total: 42,
    };
    const out = summarizeToolResult('unified_search', data);
    expect(out).toContain('results=2');
    expect(out).toContain('total=42');
    expect(out).toContain('top="APT29 targets SolarWinds supply chain"');
  });

  it('extracts relationship + node counts for get_relationships', () => {
    const data = {
      relationships: [{}, {}, {}],
      nodes: [{}, {}, {}, {}],
    };
    const out = summarizeToolResult('get_relationships', data);
    expect(out).toContain('relationships=3');
    expect(out).toContain('nodes=4');
  });

  it('falls back to generic summary for unknown tools', () => {
    const data = { verdict: 'suspicious', score: 42, items: [1, 2, 3], custom: 'field' };
    const out = summarizeToolResult('some_unknown_tool', data);
    expect(out).toContain('verdict=suspicious');
    expect(out).toContain('score=42');
    expect(out).toContain('items=3');
    expect(out).toContain('raw:');
  });

  it('respects maxLen and truncates with a marker when the structured summary itself is huge', () => {
    // Build a result whose per-tool summary (many distinct scalar fields in the
    // raw tail) exceeds a small maxLen — the truncation marker must fire.
    const data: Record<string, unknown> = { verdict: 'malicious' };
    for (let i = 0; i < 60; i++) data[`field_${i}`] = `value_${i}`.repeat(20);
    const out = summarizeToolResult('check_ioc', data, 80);
    expect(out.length).toBeLessThanOrEqual(160); // 80 + marker overhead
    expect(out).toContain('truncated');
  });

  it('stays well under maxLen when the summary compacts naturally (no truncation needed)', () => {
    // The whole point of structured summarization: a 500-item array compacts
    // to a count, so a tiny maxLen is never hit.
    const data = { items: Array.from({ length: 500 }, (_, i) => ({ title: `item-${i}` })) };
    const out = summarizeToolResult('unified_search', data, 100);
    expect(out).toContain('results=500');
    expect(out.length).toBeLessThan(100);
  });

  it('handles non-object results without throwing', () => {
    expect(summarizeToolResult('check_ioc', null)).toBe('(no data)');
    expect(summarizeToolResult('check_ioc', 'just a string')).toBe('just a string');
    expect(summarizeToolResult('check_ioc', 42)).toBe('42');
  });

  it('handles empty arrays gracefully (no items count surfaced)', () => {
    const data = { verdict: 'clean', items: [] };
    const out = summarizeToolResult('check_ioc', data);
    expect(out).toContain('verdict=clean');
    // Empty array should not produce a providers=0 line
    expect(out).not.toContain('providers=0');
  });

  it('large nested arrays are collapsed to [N items] in the raw tail', () => {
    const data = { verdict: 'malicious', bigArray: Array.from({ length: 50 }, (_, i) => i) };
    const out = summarizeToolResult('check_ioc', data);
    expect(out).toContain('[50 items]');
    // The full array should NOT be serialized
    expect(out).not.toContain('"bigArray":[0,1,2');
  });
});

describe('describeTools — action-space description', () => {
  it('formats tool name, required params, and first sentence of description', () => {
    const tools: AgentTool[] = [
      {
        name: 'check_ioc',
        description: 'Multi-provider IOC reputation check.',
        params: [
          { name: 'indicator', type: 'string', description: 'IP/domain/hash', required: true },
          { name: 'verbose', type: 'boolean', description: 'extra detail', required: false },
        ],
        execute: async () => ({}),
      },
    ];
    const out = describeTools(tools);
    // Compressed bullet format (planner context budget):
    // `- name (required, comma-separated): first-sentence description`
    expect(out).toContain('- check_ioc (indicator): Multi-provider IOC reputation check');
    // Optional params and their descriptions are omitted entirely.
    expect(out).not.toContain('verbose');
    expect(out).not.toContain('**');
  });

  it('omits the param list when no params are required', () => {
    const tools: AgentTool[] = [{ name: 'get_live_iocs', description: 'dump', params: [], execute: async () => ({}) }];
    const out = describeTools(tools);
    expect(out).toBe('- get_live_iocs: dump');
  });
});
