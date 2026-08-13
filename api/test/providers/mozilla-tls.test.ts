import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mozillaTls } from '../../src/providers/mozilla-tls';
import type { ProviderEnv } from '../../src/providers/types';

beforeEach(() => vi.restoreAllMocks());

const env = {} as ProviderEnv;

describe('mozilla-tls provider', () => {
  it('is unsupported for non-domain/ip indicators', async () => {
    const r = await mozillaTls({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('degrades to unsupported (not a red error) when the Observatory 5xxs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('upstream down', { status: 502 }));
    const r = await mozillaTls({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.tags).toContain('mozilla-observatory-unavailable');
  });

  it('degrades to unsupported on network-level failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await mozillaTls({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.tags).toContain('mozilla-observatory-unavailable');
  });

  it('maps an A+ grade to clean', async () => {
    const body = JSON.stringify({
      grade: 'A+',
      score: 115,
      scan_id: 1,
      state: 'FINISHED',
      tests_passed: 10,
      tests_failed: 0,
      tests_quantity: 11,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
    const r = await mozillaTls({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
    expect(r.tags).toContain('grade:A+');
  });

  it('maps an F grade to malicious', async () => {
    const body = JSON.stringify({
      grade: 'F',
      score: 0,
      scan_id: 2,
      state: 'FINISHED',
      tests_passed: 0,
      tests_failed: 11,
      tests_quantity: 11,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
    const r = await mozillaTls({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('11-tests-failed');
  });

  it('treats a pending scan as unsupported', async () => {
    const body = JSON.stringify({ state: 'RUNNING', grade: undefined });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
    const r = await mozillaTls({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.tags).toContain('scan-pending');
  });
});
