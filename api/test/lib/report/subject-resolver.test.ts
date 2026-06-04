import { describe, it, expect } from 'vitest';
import { resolveSubject, detectType } from '../../../src/lib/report/subject-resolver';

describe('detectType', () => {
  it('classifies by format and keyword', () => {
    expect(detectType('CVE-2024-1709')).toBe('cve');
    expect(detectType('8.8.8.8')).toBe('ip');
    expect(detectType('evil.example.com')).toBe('domain');
    expect(detectType('a'.repeat(64))).toBe('hash');
    expect(detectType('LockBit 3.0')).toBe('ransomware');
    expect(detectType('Scattered Spider')).toBe('actor');
    expect(detectType('what is happening')).toBe('generic');
  });
});

describe('resolveSubject', () => {
  it('canonicalizes a CVE and suggests the cve template', () => {
    const r = resolveSubject('  cve-2024-1709 ');
    expect(r.type).toBe('cve');
    expect(r.canonical).toBe('CVE-2024-1709');
    expect(r.identifiers.cve).toBe('CVE-2024-1709');
    expect(r.suggestedTemplate).toBe('cve');
  });
  it('maps an IP to the ioc template', () => {
    const r = resolveSubject('8.8.8.8');
    expect(r.type).toBe('ip');
    expect(r.identifiers.iocType).toBe('ipv4');
    expect(r.suggestedTemplate).toBe('ioc');
  });
  it('maps ransomware keyword to the ransomware-group template', () => {
    const r = resolveSubject('LockBit');
    expect(r.type).toBe('ransomware');
    expect(r.identifiers.group).toBe('LockBit');
    expect(r.suggestedTemplate).toBe('ransomware-group');
  });
  it('maps actor keyword to the threat-actor template', () => {
    expect(resolveSubject('APT29').suggestedTemplate).toBe('threat-actor');
  });
  it('defaults a hash to ioc and lowercases the canonical', () => {
    const h = 'AABBCCDDEEFF00112233445566778899';
    const r = resolveSubject(h);
    expect(r.type).toBe('hash');
    expect(r.canonical).toBe(h.toLowerCase());
    expect(r.identifiers.iocType).toBe('hash');
  });
});
