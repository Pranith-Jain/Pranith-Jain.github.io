import { describe, it, expect } from 'vitest';
import {
  classifyResponseError,
  classifyThrownError,
  toProviderError,
  type ProviderErrorInfo,
} from '../../src/lib/provider-errors';

describe('classifyResponseError', () => {
  it('classifies 401 as unauthorized', () => {
    const r = classifyResponseError(new Response(null, { status: 401, statusText: 'Unauthorized' }));
    expect(r.code).toBe('unauthorized');
    expect(r.status).toBe(401);
    expect(r.tags).toContain('unauthorized');
    expect(r.tags).toContain('401');
    expect(r.error).toBe('unauthorized');
  });

  it('classifies 403 as forbidden', () => {
    const r = classifyResponseError(new Response(null, { status: 403, statusText: 'Forbidden' }));
    expect(r.code).toBe('forbidden');
    expect(r.tags).toContain('403');
  });

  it('classifies 404 as not_found', () => {
    const r = classifyResponseError(new Response(null, { status: 404 }));
    expect(r.code).toBe('not_found');
    expect(r.tags).toContain('404');
  });

  it('classifies 408 as timeout (request timeout)', () => {
    const r = classifyResponseError(new Response(null, { status: 408 }));
    expect(r.code).toBe('timeout');
    expect(r.tags).toContain('408');
  });

  it('classifies 429 as rate_limited with explicit tag', () => {
    const r = classifyResponseError(new Response(null, { status: 429, statusText: 'Too Many Requests' }));
    expect(r.code).toBe('rate_limited');
    expect(r.status).toBe(429);
    expect(r.tags).toEqual(expect.arrayContaining(['rate-limited', '429']));
    expect(r.error).toBe('rate_limited');
  });

  it('classifies 500 as upstream_5xx', () => {
    const r = classifyResponseError(new Response(null, { status: 500, statusText: 'Internal Server Error' }));
    expect(r.code).toBe('upstream_5xx');
    expect(r.status).toBe(500);
    expect(r.tags).toContain('upstream-5xx');
    expect(r.tags).toContain('500');
    expect(r.error).toBe('500 Internal Server Error');
  });

  it('classifies 502/503/504 as upstream_5xx with the specific status', () => {
    for (const status of [502, 503, 504]) {
      const r = classifyResponseError(new Response(null, { status }));
      expect(r.code).toBe('upstream_5xx');
      expect(r.status).toBe(status);
      expect(r.tags).toContain(String(status));
    }
  });

  it('classifies 400/422 as upstream_4xx', () => {
    for (const status of [400, 422]) {
      const r = classifyResponseError(new Response(null, { status }));
      expect(r.code).toBe('upstream_4xx');
      expect(r.status).toBe(status);
      expect(r.tags).toContain(String(status));
    }
  });
});

describe('classifyThrownError', () => {
  it('classifies AbortError as timeout', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const r = classifyThrownError(err);
    expect(r.code).toBe('timeout');
    expect(r.tags).toContain('timeout');
    expect(r.tags).toContain('aborted');
  });

  it('classifies TypeError (DNS/network) as network', () => {
    const err = new TypeError('fetch failed');
    const r = classifyThrownError(err);
    expect(r.code).toBe('network');
    expect(r.tags).toContain('network');
    expect(r.error).toContain('network:');
  });

  it('handles non-Error throwables', () => {
    const r = classifyThrownError('plain string');
    expect(r.code).toBe('network');
    expect(r.error).toContain('plain string');
  });
});

describe('toProviderError', () => {
  it('produces a Partial<ProviderResult> with the right fields', () => {
    const info: ProviderErrorInfo = {
      error: 'rate_limited',
      code: 'rate_limited',
      status: 429,
      tags: ['rate-limited', '429'],
    };
    const out = toProviderError(info);
    expect(out.error).toBe('rate_limited');
    expect(out.error_code).toBe('rate_limited');
    expect(out.error_status).toBe(429);
    expect(out.error_tags).toEqual(['rate-limited', '429']);
  });

  it('preserves the tag order (code first, status second)', () => {
    const r = toProviderError(classifyResponseError(new Response(null, { status: 502, statusText: 'Bad Gateway' })));
    expect(r.error_tags).toEqual(['upstream-5xx', '502']);
  });
});
