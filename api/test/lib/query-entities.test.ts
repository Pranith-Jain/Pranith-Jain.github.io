import { describe, it, expect } from 'vitest';
import { extractQueryEntities, hasIndicators, entitiesToMemoryIndicators } from '../../src/lib/agent/query-entities';

describe('extractQueryEntities', () => {
  it('extracts IPs, hashes, CVEs, domains, urls, actors', () => {
    const e = extractQueryEntities(
      'Investigate 1.2.3.4 and CVE-2024-12345, hash 44d88612fea8a8f36de82e1278abb02f, evil.com, https://bad.example/x — is this APT28?'
    );
    expect(e.ips).toEqual(['1.2.3.4']);
    expect(e.cves).toEqual(['CVE-2024-12345']);
    expect(e.hashes).toEqual(['44d88612fea8a8f36de82e1278abb02f']);
    expect(e.domains).toContain('evil.com');
    expect(e.urls).toEqual(['https://bad.example/x']);
    expect(e.actors).toEqual(['APT28']);
  });

  it('rejects invalid IPs and dedupes', () => {
    const e = extractQueryEntities('999.1.1.1 and 1.2.3.4 and 1.2.3.4');
    expect(e.ips).toEqual(['1.2.3.4']);
  });

  it('normalises CVE case and hash case', () => {
    const e = extractQueryEntities('cve-2023-99999 and ' + 'A'.repeat(64));
    expect(e.cves).toEqual(['CVE-2023-99999']);
    expect(e.hashes).toEqual(['a'.repeat(64)]);
  });

  it('returns empty arrays for plain queries', () => {
    const e = extractQueryEntities('what is the threat landscape this week?');
    expect(hasIndicators(e)).toBe(false);
  });
});

describe('entitiesToMemoryIndicators', () => {
  it('flattens entities into memory lookup shape', () => {
    const e = extractQueryEntities('1.2.3.4 evil.com CVE-2024-1234 APT28');
    const ind = entitiesToMemoryIndicators(e);
    expect(ind.iocs).toContain('1.2.3.4');
    expect(ind.iocs).toContain('evil.com');
    expect(ind.cves).toEqual(['CVE-2024-1234']);
    expect(ind.actors).toEqual(['APT28']);
  });
});
