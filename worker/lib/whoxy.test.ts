import { describe, it, expect, vi, beforeEach } from 'vitest';
import { whoxyReverseWhois } from './whoxy';

const env: Record<string, string> = { WHOXY_API_KEY: 'fake-key' };

beforeEach(() => vi.restoreAllMocks());

it('returns domains for a valid email search', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status: 1,
        total_results: 2,
        total_pages: 1,
        search_result: [
          {
            domain_name: 'example.com',
            registrant_name: 'John',
            company_name: 'Acme',
            registrant_email: 'john@example.com',
            creation_date: '2020-01-01',
            expiry_date: '2025-01-01',
          },
          { domain_name: 'test.org', registrant_name: 'John', registrant_email: 'john@example.com' },
        ],
      }),
      { status: 200 }
    )
  );
  const r = await whoxyReverseWhois(env, 'john@example.com', 'email');
  expect(r.success).toBe(true);
  expect(r.domains).toHaveLength(2);
  expect(r.domains[0].domain_name).toBe('example.com');
  expect(r.total_results).toBe(2);
  expect(r.pages_fetched).toBe(1);
  const d0 = r.diagnostics[0]!;
  expect(d0.status).toBe('ok');
});

it('returns diagnostic for empty query', async () => {
  const r = await whoxyReverseWhois(env, '', 'email');
  expect(r.success).toBe(false);
  expect(r.domains).toHaveLength(0);
  expect(r.diagnostics[0]!.status).toBe('failed');
  expect(r.diagnostics[0]!.error).toContain('empty');
});

it('returns diagnostic when API key is missing', async () => {
  const r = await whoxyReverseWhois({}, 'test@test.com', 'email');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0]!.status).toBe('skipped');
});

it('handles whoxy API error response (status=0)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ status: 0, message: 'Invalid API key' }), { status: 200 })
  );
  const r = await whoxyReverseWhois(env, 'test@test.com', 'email');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0]!.status).toBe('failed');
  expect(r.diagnostics[0]!.error).toContain('Invalid API key');
});

it('handles HTTP error from whoxy', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
  const r = await whoxyReverseWhois(env, 'test@test.com', 'email');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0]!.status).toBe('failed');
  expect(r.diagnostics[0]!.error).toContain('429');
});

it('handles fetch rejection', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network failure'));
  const r = await whoxyReverseWhois(env, 'test@test.com', 'email');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0]!.status).toBe('failed');
  expect(r.diagnostics[0]!.error).toContain('network failure');
});

it('paginates through multiple pages', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status: 1,
        total_results: 3,
        total_pages: 2,
        search_result: [{ domain_name: 'a.com' }, { domain_name: 'b.com' }],
      }),
      { status: 200 }
    )
  );
  fetchSpy.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status: 1,
        total_results: 3,
        total_pages: 2,
        search_result: [{ domain_name: 'c.com' }],
      }),
      { status: 200 }
    )
  );
  const r = await whoxyReverseWhois(env, 'test@test.com', 'email');
  expect(r.success).toBe(true);
  expect(r.domains).toHaveLength(3);
  expect(r.pages_fetched).toBe(2);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it('supports name search type', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status: 1,
        total_results: 1,
        total_pages: 1,
        search_result: [{ domain_name: 'johnsmith.com', registrant_name: 'John Smith' }],
      }),
      { status: 200 }
    )
  );
  const r = await whoxyReverseWhois(env, 'John Smith', 'name');
  expect(r.success).toBe(true);
  expect(r.search_type).toBe('name');
  expect(r.domains[0].domain_name).toBe('johnsmith.com');
});

it('supports company search type', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status: 1,
        total_results: 1,
        total_pages: 1,
        search_result: [{ domain_name: 'acme.com', company_name: 'Acme Corp' }],
      }),
      { status: 200 }
    )
  );
  const r = await whoxyReverseWhois(env, 'Acme Corp', 'company');
  expect(r.success).toBe(true);
  expect(r.search_type).toBe('company');
});

it('supports keyword search type', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status: 1,
        total_results: 1,
        total_pages: 1,
        search_result: [{ domain_name: 'yahoo.com' }],
      }),
      { status: 200 }
    )
  );
  const r = await whoxyReverseWhois(env, 'yahoo', 'keyword');
  expect(r.success).toBe(true);
  expect(r.search_type).toBe('keyword');
  // keyword uses identifier=keyword in URL, not email/name/company
  const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
  expect(calledUrl).toContain('keyword=yahoo');
});
