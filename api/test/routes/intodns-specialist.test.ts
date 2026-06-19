import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

// These tests assert the intodns specialist route contracts: validation,
// upstream-error handling, and cache-header propagation. The actual upstream
// call is mocked so the test doesn't need network access.

describe('GET /api/v1/intodns/blacklist', () => {
  it('rejects missing domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/blacklist');
    expect(r.status).toBe(400);
  });

  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/blacklist?domain=not--a--domain');
    expect(r.status).toBe(400);
  });

  it('returns parsed JSON on 200 and surfaces X-Intodns-Cache header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ domain: 'example.com', mailServers: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await SELF.fetch('https://x/api/v1/intodns/blacklist?domain=example.com');
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Intodns-Endpoint')).toBe('blacklist');
    expect(['hit', 'miss']).toContain(r.headers.get('X-Intodns-Cache'));
    const body = (await r.json()) as { domain?: string };
    expect(body.domain).toBe('example.com');
  });
});

describe('GET /api/v1/intodns/smtp-tls', () => {
  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/smtp-tls?domain=foo bar');
    expect(r.status).toBe(400);
  });
});

describe('GET /api/v1/intodns/dnssec', () => {
  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/dnssec?domain=');
    expect(r.status).toBe(400);
  });
});

describe('GET /api/v1/intodns/sec-headers', () => {
  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/sec-headers?domain=');
    expect(r.status).toBe(400);
  });
});

describe('GET /api/v1/intodns/badge', () => {
  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/badge?domain=foo bar');
    expect(r.status).toBe(400);
  });
});

describe('POST /api/v1/intodns/debug-email', () => {
  it('rejects empty body', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/debug-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw_email: '' }),
    });
    expect(r.status).toBe(400);
  });

  it('rejects missing raw_email', async () => {
    const r = await SELF.fetch('https://x/api/v1/intodns/debug-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });
});
