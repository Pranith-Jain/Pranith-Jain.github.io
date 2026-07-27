import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateXCookiesShape, checkXHealth } from '../../api/src/lib/twitter-auth-graphql';
import type { Env } from '../../api/src/env';

const VALID_TOKEN = 'a'.repeat(40);
const VALID_CT0 = 'b'.repeat(160);

function envWith(secrets: Record<string, string>): Env {
  return secrets as unknown as Env;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // fetchAuthedTimeline reads/writes the edge Cache API, which jsdom lacks.
  // A perpetual cache-miss stub forces the live fetch path deterministically.
  (globalThis as unknown as { caches: unknown }).caches = {
    default: { match: () => Promise.resolve(undefined), put: () => Promise.resolve(undefined) },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
});

describe('validateXCookiesShape', () => {
  it('accepts well-formed cookies', () => {
    expect(validateXCookiesShape(VALID_TOKEN, VALID_CT0)).toBeNull();
  });

  it('rejects missing values', () => {
    expect(validateXCookiesShape('', VALID_CT0)).toMatch(/required/);
    expect(validateXCookiesShape(VALID_TOKEN, '')).toMatch(/required/);
  });

  it('rejects a malformed auth token', () => {
    expect(validateXCookiesShape('short', VALID_CT0)).toMatch(/authToken/);
  });

  it('rejects a malformed ct0', () => {
    expect(validateXCookiesShape(VALID_TOKEN, 'short')).toMatch(/ct0/);
  });
});

describe('checkXHealth', () => {
  it('reports auth missing when no cookies are configured', async () => {
    const h = await checkXHealth(envWith({}));
    expect(h.auth).toBe('missing');
    expect(h.qids).toBe('unknown');
  });

  it('reports auth expired on HTTP 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 401 }));
    const h = await checkXHealth(envWith({ X_AUTH_TOKEN: VALID_TOKEN, X_CT0: VALID_CT0 }));
    expect(h.auth).toBe('expired');
    expect(h.qids).toBe('unknown');
  });

  it('reports rate-limited on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 }));
    const h = await checkXHealth(envWith({ X_AUTH_TOKEN: VALID_TOKEN, X_CT0: VALID_CT0 }));
    expect(h.rateLimited).toBe(true);
    expect(h.auth).toBe('ok');
  });

  it('reports stale query IDs on a GraphQL error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'Could not find these' }] }), { status: 200 })
    );
    const h = await checkXHealth(envWith({ X_AUTH_TOKEN: VALID_TOKEN, X_CT0: VALID_CT0 }));
    expect(h.auth).toBe('ok');
    expect(h.qids).toBe('stale');
  });

  it('reports healthy when the canary fetch succeeds', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              user: {
                result: {
                  rest_id: '123',
                  legacy: { name: 'Twitter', description: '', followers_count: 1, profile_image_url_https: 'https://x/y.png' },
                },
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { user: { result: { timeline_v2: { timeline: { instructions: [] } } } } } }),
          { status: 200 }
        )
      );
    const h = await checkXHealth(envWith({ X_AUTH_TOKEN: VALID_TOKEN, X_CT0: VALID_CT0 }));
    expect(h.auth).toBe('ok');
    expect(h.qids).toBe('ok');
    expect(h.rateLimited).toBe(false);
  });
});
