import { describe, it, expect } from 'vitest';
import { resolveRoutingQueryType, getSpecialistsForQueryType } from '../../src/lib/agent/specialist-types';

describe('resolveRoutingQueryType', () => {
  it('never overrides an already-specific query type', () => {
    expect(resolveRoutingQueryType('anything about CVE-2024-1234', 'actor')).toBe('actor');
  });

  it('detects explicit indicators in generic queries', () => {
    expect(resolveRoutingQueryType('what is CVE-2024-12345?', 'generic')).toBe('cve');
    expect(resolveRoutingQueryType('check 1.2.3.4', 'generic')).toBe('ip');
    expect(resolveRoutingQueryType('scan ' + 'a'.repeat(64), 'generic')).toBe('hash');
    expect(resolveRoutingQueryType('analyze https://evil.example/x', 'generic')).toBe('url');
  });

  it('falls back to intent classification for actors and malware', () => {
    expect(resolveRoutingQueryType('what is APT28 doing?', 'generic')).toBe('actor');
    expect(resolveRoutingQueryType('tell me about lockbit', 'generic')).toBe('ransomware');
  });

  it('leaves truly generic queries unchanged', () => {
    expect(resolveRoutingQueryType('give me a threat overview', 'generic')).toBe('generic');
  });
});

describe('getSpecialistsForQueryType with query refinement', () => {
  it('routes a generic query containing a CVE to the vulnerability chain', () => {
    const roles = getSpecialistsForQueryType('generic', 'prioritise CVE-2024-12345');
    expect(roles[0]).toBe('vulnerability');
  });

  it('keeps the static route when no query is supplied', () => {
    expect(getSpecialistsForQueryType('cve')).toContain('vulnerability');
  });
});
