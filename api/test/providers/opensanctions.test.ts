import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opensanctions } from '../../src/providers/opensanctions';
import type { ProviderEnv } from '../../src/providers/types';

beforeEach(() => vi.restoreAllMocks());

const env = (apiKey?: string) => ({ OPENSANCTIONS_API_KEY: apiKey }) as ProviderEnv;

describe('opensanctions provider', () => {
  it('degrades to unsupported (no_api_key) when no API key is configured', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await opensanctions({ type: 'email', value: 'x@y.com' }, env(undefined), AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.error_code).toBe('no_api_key');
    expect(spy).not.toHaveBeenCalled();
  });

  it('is unsupported for unsupported indicator types', async () => {
    const r = await opensanctions({ type: 'ipv6', value: '::1' }, env('key'), AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('sends Authorization: ApiKey header on the search call', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: { value: 0 }, results: [] }), { status: 200 }));
    await opensanctions({ type: 'email', value: 'x@y.com' }, env('test-key'), AbortSignal.timeout(2000));
    const headers = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    const auth = (headers?.headers as Record<string, string> | undefined)?.Authorization;
    expect(auth).toBe('ApiKey test-key');
  });

  it('treats a rejected API key as unsupported (unauthorized) rather than a hard error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Invalid API key' }), { status: 401 })
    );
    const r = await opensanctions({ type: 'email', value: 'x@y.com' }, env('bad-key'), AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.error_code).toBe('unauthorized');
  });

  it('returns clean when no sanctions match', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ total: { value: 0 }, results: [] }), { status: 200 })
    );
    const r = await opensanctions({ type: 'email', value: 'x@y.com' }, env('key'), AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
    expect(r.tags).toContain('no-sanctions-hit');
  });
});
