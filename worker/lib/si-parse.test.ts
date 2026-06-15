import { describe, it, expect } from 'vitest';
import { siParseText, parseArtifacts, refang, foldHomographs } from './si-parse';

describe('si-parse: refang', () => {
  it('refangs hxxp and hxxps', () => {
    expect(refang('hxxp://evil[.]com/payload')).toBe('http://evil.com/payload');
    expect(refang('hxxps://evil[.]com/payload')).toBe('https://evil.com/payload');
  });
  it('refangs bracket defang forms', () => {
    expect(refang('evil[.]com')).toBe('evil.com');
    expect(refang('hxxp[://]evil[.com]')).toBe('http://evil.com');
  });
  it('refangs spelled-out dot', () => {
    expect(refang('evil[dot]com')).toBe('evil.com');
  });
  it('handles nested defangs', () => {
    expect(refang('hxxp[://]evil[dot]com')).toBe('http://evil.com');
  });
});

describe('si-parse: foldHomographs', () => {
  it('folds Cyrillic а → a', () => {
    const out = foldHomographs('\u0430pple.com');
    expect(out.folded).toBe('apple.com');
    expect(out.changed).toBe(true);
  });
  it('returns unchanged for ASCII', () => {
    const out = foldHomographs('apple.com');
    expect(out.changed).toBe(false);
  });
});

describe('si-parse: 18 artifact types', () => {
  const sample = `
Incident: APT-29 phish delivered 2024-08-12 to user@contoso.com from hxxp://evil[.]com/payload.docm
Hash: 5d41402abc4b2a76b9719d911017c592 (MD5), da39a3ee5e6b4b0d3255bfef95601890afd80709 (SHA1)
SHA256: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
SHA512: cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e
CVE-2024-38063 (Windows TCP/IP IPv6 RCE). CWE-787. T1059.001. T1078.004.
Process: powershell.exe -EncodedCommand ZQBjAGgAbwAgACIAdABlAHMAdAAiAA==
Path: C:\\Users\\Public\\runme.exe and /home/user/.local/runme
Registry: HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater
DLL: winhttp.dll
Port: 8443, 22
MAC: 00:1A:2B:3C:4D:5E
ASN: AS13335
IPv4: 192.0.2.44, 8.8.8.8
IPv6: 2001:db8::1
URL: https://example.com/path?q=1
Domain: example.com
Email: cfo@contoso.com
  `;
  const r = siParseText(sample);

  it('detects all 18 kinds (with non-zero count)', () => {
    const expected = ['ipv4','ipv6','domain','url','email','md5','sha1','sha256','sha512','cve','mitre','registry','process','dll','filePath','port','mac','asn'] as const;
    for (const k of expected) {
      expect(r.counts[k], `count for ${k} should be > 0`).toBeGreaterThan(0);
    }
  });
  it('extracts CVE with correct format', () => {
    expect(r.artifacts.cve[0]?.value).toBe('CVE-2024-38063');
  });
  it('extracts MITRE technique with sub-id', () => {
    expect(r.artifacts.mitre.some((m) => m.value === 'T1059.001')).toBe(true);
    expect(r.artifacts.mitre.some((m) => m.value === 'T1078.004')).toBe(true);
  });
  it('extracts windows registry keys', () => {
    expect(r.artifacts.registry[0]?.value).toContain('HKLM');
    expect(r.artifacts.registry[0]?.value).toContain('CurrentVersion\\Run');
  });
  it('extracts both windows and unix paths', () => {
    expect(r.artifacts.filePath.some((p) => p.value.startsWith('C:\\'))).toBe(true);
    expect(r.artifacts.filePath.some((p) => p.value.includes('/home/user/'))).toBe(true);
  });
  it('extracts port as digit (capture group 1)', () => {
    expect(r.artifacts.port.map((p) => p.value)).toContain('8443');
  });
  it('extracts MAC address', () => {
    expect(r.artifacts.mac[0]?.value).toBe('00:1A:2B:3C:4D:5E');
  });
  it('extracts ASN as digits', () => {
    expect(r.artifacts.asn[0]?.value).toBe('13335');
  });
  it('groups IOCs by network/host/threat', () => {
    expect(r.iocs.network.length).toBeGreaterThan(0);
    expect(r.iocs.host.length).toBeGreaterThan(0);
    expect(r.iocs.threat.length).toBeGreaterThan(0);
    for (const i of r.iocs.threat) expect(['cve', 'mitre']).toContain(i.kind);
  });
  it('respects kinds filter', () => {
    const r2 = siParseText(sample, { kinds: ['cve', 'mitre'] });
    expect(r2.counts.cve).toBeGreaterThan(0);
    expect(r2.counts.ipv4).toBe(0);
    expect(r2.counts.sha256).toBe(0);
  });
  it('flags sub-hash false positives (sha1 prefix of sha256)', () => {
    // The first 40 chars of the SHA-256 above are not the SHA-1, but the
    // SHA-1 we have is its own complete hash. We just verify that the
    // de-dup logic does not double-count anything.
    const r3 = siParseText(sample);
    const hashValues = [...r3.artifacts.sha1, ...r3.artifacts.sha256, ...r3.artifacts.sha512, ...r3.artifacts.md5].map((a) => a.value);
    const uniq = new Set(hashValues.map((v) => v.toLowerCase()));
    expect(uniq.size).toBe(hashValues.length);
  });
});

describe('si-parse: input handling', () => {
  it('returns empty result for empty input', () => {
    const r = siParseText('');
    expect(r.counts.ipv4).toBe(0);
    expect(r.iocs.network).toEqual([]);
  });
  it('throws on input exceeding maxChars', () => {
    expect(() => siParseText('a'.repeat(2000), { maxChars: 100 })).toThrow(/maxChars/);
  });
});
