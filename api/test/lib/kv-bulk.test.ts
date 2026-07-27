import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { kvBulkGetText } from '../../src/lib/safe-catch';

describe('kvBulkGetText', () => {
  it('empty key list returns an empty Map', async () => {
    const out = await kvBulkGetText(env.KV_CACHE, []);
    expect(out.size).toBe(0);
  });

  it('returns values for present keys and null for missing keys', async () => {
    await env.KV_CACHE.put('kbt:a', 'alpha');
    await env.KV_CACHE.put('kbt:b', 'beta');
    const out = await kvBulkGetText(env.KV_CACHE, ['kbt:a', 'kbt:missing', 'kbt:b']);
    expect(out.get('kbt:a')).toBe('alpha');
    expect(out.get('kbt:b')).toBe('beta');
    expect(out.get('kbt:missing')).toBeNull();
  });

  it('chunks reads larger than the 100-key bulk limit and merges results', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 105; i++) {
      const key = `kbt:chunk:${i}`;
      keys.push(key);
      await env.KV_CACHE.put(key, `v${i}`);
    }
    const out = await kvBulkGetText(env.KV_CACHE, keys);
    expect(out.size).toBe(105);
    expect(out.get('kbt:chunk:0')).toBe('v0');
    // Index 100 lands in the second chunk — proves cross-chunk merge works.
    expect(out.get('kbt:chunk:100')).toBe('v100');
    expect(out.get('kbt:chunk:104')).toBe('v104');
  });

  it('fails soft when a chunk read throws (keys become null, no throw)', async () => {
    const failing = {
      get: async () => {
        throw new Error('boom');
      },
    } as unknown as KVNamespace;
    const out = await kvBulkGetText(failing, ['x', 'y']);
    expect(out.get('x')).toBeNull();
    expect(out.get('y')).toBeNull();
  });
});
