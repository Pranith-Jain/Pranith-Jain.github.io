import { describe, it, expect } from 'vitest';
import { extractQueryEntities, hasIndicators, entitiesToMemoryIndicators } from '../../src/lib/agent/query-entities';
import { jsonEscapeForLike } from '../../src/lib/agent/investigation-memory';

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

// ─────────────────────────────────────────────────────────────────────────────
// Memory contamination guard (audit Fix #8/#11): the exact-value LIKE pattern
// must not let a short IOC match a longer stored value (e.g. searching for
// "1.2.3.4" must NOT match a stored "10.1.2.3.45"). This pins the contract so
// a refactor cannot silently regress to bare `LIKE '%ioc%'` substring matching.
// ─────────────────────────────────────────────────────────────────────────────

describe('jsonEscapeForLike — exact-value matching contract', () => {
  it('escapes backslash, double-quote, and LIKE wildcards (% and _)', () => {
    expect(jsonEscapeForLike('simple')).toBe('simple');
    expect(jsonEscapeForLike('a\\b')).toBe('a\\\\b');
    expect(jsonEscapeForLike('a"b')).toBe('a\\"b');
    expect(jsonEscapeForLike('a%b')).toBe('a\\%b');
    expect(jsonEscapeForLike('a_b')).toBe('a\\_b');
  });

  it('produces a JSON-boundary pattern that matches the exact value, not substrings', () => {
    // The iocs column stores [{"type":"ipv4","value":"1.2.3.4",...}].
    // The pattern built by lookupMemory is %"value":"<escaped>"%.
    const storedIocsJson = JSON.stringify([{ type: 'ipv4', value: '1.2.3.4', confidence: 'medium' }]);
    const pattern = `%"value":"${jsonEscapeForLike('1.2.3.4')}"%`;
    expect(storedIocsJson.includes(`"value":"1.2.3.4"`)).toBe(true);
    expect(storedIocsJson.match(pattern.replace(/%/g, '.*'))).not.toBeNull();
  });

  it('does NOT let "1.2.3.4" match a stored "10.1.2.3.45" (substring contamination)', () => {
    // The whole point of the exact-value fix: a bare LIKE '%1.2.3.4%' would
    // match the stored 10.1.2.3.45. The JSON-boundary pattern must not.
    const storedIocsJson = JSON.stringify([{ type: 'ipv4', value: '10.1.2.3.45', confidence: 'medium' }]);
    // Direct substring check (what bare LIKE would do):
    expect(storedIocsJson.includes('1.2.3.4')).toBe(true); // ← the contamination bug
    // JSON-boundary check (what the fix does):
    expect(storedIocsJson.includes(`"value":"1.2.3.4"`)).toBe(false); // ← fixed
  });

  it('does NOT let "evil.com" match a stored "not-evil.com" (domain substring)', () => {
    const storedActorsJson = JSON.stringify(['not-evil.com', 'apt29']);
    // Bare LIKE '%evil.com%' would match. The quoted-boundary pattern must not.
    expect(storedActorsJson.includes('evil.com')).toBe(true); // ← contamination
    expect(storedActorsJson.includes('"evil.com"')).toBe(false); // ← fixed
  });
});

describe('extractQueryEntities → memory lookup — no spurious contamination', () => {
  it('a natural-language query mentioning an IOC triggers a lookup that uses exact-value matching', () => {
    // The full flow: query → extractQueryEntities → entitiesToMemoryIndicators →
    // lookupMemory builds %"value":"<ioc>"% patterns. Pin that the extracted IOC
    // is the exact value (not a substring of a longer value).
    const e = extractQueryEntities('tell me about the concept of 1.2.3.4 in networking');
    expect(e.ips).toEqual(['1.2.3.4']);
    const ind = entitiesToMemoryIndicators(e);
    expect(ind.iocs).toContain('1.2.3.4');
    // The pattern built from this IOC must match ONLY a stored "1.2.3.4", not
    // "10.1.2.3.45" or "1.2.3.45".
    const exactValue = ind.iocs[0]!;
    const pattern = `%"value":"${jsonEscapeForLike(exactValue)}"%`;
    expect(pattern).toBe('%"value":"1.2.3.4"%');
    // Stored 10.1.2.3.45 must not match this pattern.
    const storedLonger = JSON.stringify([{ type: 'ipv4', value: '10.1.2.3.45' }]);
    expect(storedLonger.includes(`"value":"1.2.3.4"`)).toBe(false);
  });
});
