import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cape } from '../../src/providers/cape';
import type { Indicator, ProviderEnv } from '../../src/providers/types';

const env = { CAPE_BRIDGE_URL: 'https://cape.example.com', CAPE_BRIDGE_TOKEN: 'tok' } as ProviderEnv;
const sig = () => AbortSignal.timeout(5000);
const hashIndicator = (): Indicator => ({ type: 'hash', value: 'a'.repeat(64) });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('cape provider', () => {
  it('is unsupported for non-hash indicators', async () => {
    const r = await cape({ type: 'ipv4', value: '1.2.3.4' }, env, sig());
    expect(r.status).toBe('unsupported');
    expect(r.source).toBe('cape');
  });

  it('is unsupported when the bridge is not configured', async () => {
    const r = await cape(hashIndicator(), {} as ProviderEnv, sig());
    expect(r.status).toBe('unsupported');
  });

  it('returns a clean verdict when the hash is not in the sandbox', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: false, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await cape(hashIndicator(), env, sig());
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
    expect(r.score).toBe(0);
  });

  it('maps a high malscore to a malicious verdict with a sandboxed tag', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: false, data: [{ id: 1, malscore: 9 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await cape(hashIndicator(), env, sig());
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(90);
    expect(r.tags).toContain('sandboxed:1');
  });

  it('returns an error result when the bridge call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const r = await cape(hashIndicator(), env, sig());
    expect(r.status).toBe('error');
  });
});
