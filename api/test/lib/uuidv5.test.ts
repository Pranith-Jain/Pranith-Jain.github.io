import { describe, it, expect } from 'vitest';
import { uuidv5, stixId, NS_INTEL_BUNDLE } from '../../src/lib/uuidv5';

describe('uuidv5', () => {
  it('matches RFC 4122 test vector for the DNS namespace + "www.example.org"', async () => {
    // Vector from RFC 4122 Appendix B / canonical test data.
    const NS_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const got = await uuidv5('www.example.org', NS_DNS);
    expect(got).toBe('74738ff5-5367-5958-9aee-98fffdcd1876');
  });

  it('is deterministic for the same (name, namespace)', async () => {
    const a = await uuidv5('apt28', NS_INTEL_BUNDLE);
    const b = await uuidv5('apt28', NS_INTEL_BUNDLE);
    expect(a).toBe(b);
  });

  it('produces different UUIDs for different names', async () => {
    const a = await uuidv5('apt28');
    const b = await uuidv5('apt29');
    expect(a).not.toBe(b);
  });

  it('produces different UUIDs for different namespaces', async () => {
    const a = await uuidv5('apt28', NS_INTEL_BUNDLE);
    const b = await uuidv5('apt28', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(a).not.toBe(b);
  });

  it('sets version 5 in the high nibble of byte 6', async () => {
    const u = await uuidv5('whatever');
    // 8-4-4-4-12 — the third group's first char encodes the version.
    expect(u.charAt(14)).toBe('5');
  });

  it('sets RFC 4122 variant in the high two bits of byte 8', async () => {
    const u = await uuidv5('whatever');
    // Fourth group's first char ∈ {8, 9, a, b}.
    expect(['8', '9', 'a', 'b']).toContain(u.charAt(19));
  });

  it('accepts namespace with or without dashes', async () => {
    const withDashes = await uuidv5('apt28', NS_INTEL_BUNDLE);
    const withoutDashes = await uuidv5('apt28', NS_INTEL_BUNDLE.replace(/-/g, ''));
    expect(withDashes).toBe(withoutDashes);
  });

  it('rejects malformed namespace', async () => {
    await expect(uuidv5('apt28', 'not-a-uuid')).rejects.toThrow(/invalid namespace/);
  });
});

describe('stixId', () => {
  it('prefixes the UUID with the STIX object type', async () => {
    const id = await stixId('indicator', 'domain|evil.com');
    expect(id).toMatch(/^indicator--[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is deterministic across calls', async () => {
    const a = await stixId('threat-actor', 'apt28');
    const b = await stixId('threat-actor', 'apt28');
    expect(a).toBe(b);
  });
});
