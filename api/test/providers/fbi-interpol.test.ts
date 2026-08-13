import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fbiWanted } from '../../src/providers/fbi-wanted';
import { interpol } from '../../src/providers/interpol';
import type { ProviderEnv } from '../../src/providers/types';

beforeEach(() => vi.restoreAllMocks());

const env = {} as ProviderEnv;

describe('fbi-wanted provider', () => {
  it('degrades to unsupported when Akamai serves the HTML bot-page (403)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html><title>security issue</title></html>', {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );
    const r = await fbiWanted({ type: 'email', value: 'x@y.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.tags).toContain('upstream-waf-block');
    expect(r.error_code).toBe('forbidden');
  });

  it('still reports a JSON 403 as an error (real API rejection, not a WAF page)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await fbiWanted({ type: 'email', value: 'x@y.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error_code).toBe('forbidden');
  });
});

describe('interpol provider', () => {
  it('degrades to unsupported when Akamai serves the HTML bot-page (403)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<HTML><TITLE>Access Denied</TITLE></HTML>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      })
    );
    const r = await interpol({ type: 'email', value: 'x@y.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.tags).toContain('upstream-waf-block');
    expect(r.error_code).toBe('forbidden');
  });

  it('returns malicious when a Red Notice matches', async () => {
    const body = JSON.stringify({
      total: 1,
      _embedded: {
        notices: [{ entity_id: '2026/1', name: 'Smith', forename: 'John', nationality: ['US'] }],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const r = await interpol({ type: 'email', value: 'x@y.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(90);
  });
});
