import { describe, it, expect } from 'vitest';
import { cveKey, actorKey, malwareKey, ransomKey, slotIdFor } from '../../src/case-study/stable-keys';

describe('stable-keys', () => {
  it('cveKey lowercases and normalizes', () => {
    expect(cveKey('CVE-2026-1234')).toBe('cve-2026-1234');
    expect(cveKey('cve-2026-1234')).toBe('cve-2026-1234');
  });

  it('actorKey slugifies group name', () => {
    expect(actorKey('FIN7')).toBe('actor-fin7');
    expect(actorKey('APT29 (Cozy Bear)')).toBe('actor-apt29-cozy-bear');
  });

  it('malwareKey slugifies family name', () => {
    expect(malwareKey('Lumma Stealer')).toBe('malware-lumma-stealer');
  });

  it('ransomKey includes year-month bucket', () => {
    expect(ransomKey('Akira', new Date('2026-05-14T00:00:00Z'))).toBe('ransom-akira-2026-05');
  });

  it('slotIdFor is deterministic per slot', () => {
    expect(slotIdFor('2026-05-19T14:23:00Z')).toBe('slot-2026-05-19t14-23-00z');
  });

  it('rejects empty input', () => {
    expect(() => cveKey('')).toThrow();
    expect(() => actorKey('')).toThrow();
  });
});
