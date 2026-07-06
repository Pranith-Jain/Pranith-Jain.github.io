import { describe, it, expect, vi, beforeEach } from 'vitest';
import { traceixLookup } from './traceix';

const env: Record<string, string> = { TRACEIX_API_KEY: 'fake-key' };

beforeEach(() => vi.restoreAllMocks());

it('returns AV results for a valid SHA-256 hash', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        success: true,
        request_timestamp: 1700000000,
        results: [
          { engine: 'ClamAV', engine_type: 'antivirus', file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', verdict: 'Safe' },
          { engine: 'BitDefender', engine_type: 'antivirus', file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', verdict: 'Safe' },
        ],
      }),
      { status: 200 }
    )
  );
  const r = await traceixLookup(env, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(r.success).toBe(true);
  expect(r.avResults).toHaveLength(2);
  expect(r.diagnostics[0].status).toBe('ok');
});

it('returns diagnostic for invalid hash format', async () => {
  const r = await traceixLookup(env, 'not-a-valid-hash');
  expect(r.success).toBe(false);
  expect(r.avResults).toHaveLength(0);
  expect(r.diagnostics[0].status).toBe('failed');
});

it('returns diagnostic when API key is missing', async () => {
  const r = await traceixLookup({}, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0].status).toBe('skipped');
});

it('handles traceix API error response', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ success: false, error: { error_message: 'bad request' } }), { status: 400 })
  );
  const r = await traceixLookup(env, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0].status).toBe('failed');
  expect(r.diagnostics[0].error).toContain('bad request');
});

it('handles fetch rejection', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network failure'));
  const r = await traceixLookup(env, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(r.success).toBe(false);
  expect(r.diagnostics[0].status).toBe('failed');
  expect(r.diagnostics[0].error).toContain('network failure');
});
