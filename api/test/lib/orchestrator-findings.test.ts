import { describe, it, expect } from 'vitest';
import { extractFindings } from '../../src/lib/agent/orchestrator';
import type { AgentToolResult } from '../../src/lib/agent/types';

function ok(tool: string, args: Record<string, unknown>, data: unknown): AgentToolResult {
  return { tool, args, status: 'ok', data, durationMs: 1 };
}

describe('extractFindings', () => {
  it('extracts a high-confidence IOC from a malicious check_ioc verdict', () => {
    const findings = extractFindings(ok('check_ioc', { indicator: '1.2.3.4' }, { verdict: 'malicious' }), undefined, 1);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: 'ioc', value: '1.2.3.4', confidence: 'high' });
  });

  it('extracts a CVE finding with KEV → high confidence', () => {
    const findings = extractFindings(ok('lookup_cve', { cve_id: 'CVE-2024-1234' }, { kev: true }), undefined, 1);
    expect(findings[0]).toMatchObject({ type: 'cve', value: 'CVE-2024-1234', confidence: 'high' });
  });

  it('extracts an actor finding from enrich_actor', () => {
    const findings = extractFindings(ok('enrich_actor', { name: 'APT28' }, { aliases: [] }), undefined, 2);
    expect(findings[0]).toMatchObject({ type: 'actor', value: 'APT28', confidence: 'high' });
  });

  it('returns nothing for non-object or empty data', () => {
    expect(extractFindings(ok('check_ioc', {}, null), undefined, 1)).toEqual([]);
    expect(extractFindings(ok('unknown_tool', {}, { foo: 'bar' }), undefined, 1)).toEqual([]);
  });
});
