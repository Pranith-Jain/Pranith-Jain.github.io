import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import {
  FEED_TOKEN_PATHS,
  feedTokenSecret,
  monthlyExpiryMs,
  signFeedToken,
  validateFeedToken,
} from '../../src/lib/feed-token';
import { cveDigestFeedUrlHandler, CVE_DIGEST_FEED_SCOPE } from '../../src/routes/cve-digest-export';

/**
 * Feed-token gating for the CVE-digest RSS feed.
 *
 * The problem: a real RSS client (Feedly, Inoreader, a cron `curl`) sends no
 * `Sec-Fetch-Site`, no `Origin` and no `Authorization`, so
 * `authenticate('external-only')` 401'd every one of them. The existing fix in
 * this codebase is EXEMPT_PATHS — which makes the feed world-enumerable. This
 * is the middle path: an unguessable URL, revoked by rotating the secret.
 *
 * The properties worth pinning are the ones a mistake would silently break:
 * scope binding (a digest token must not unlock the JSON/CSV siblings),
 * expiry, and failing closed when no secret exists.
 */

const SECRET = 'test-feed-secret';
const SCOPE = CVE_DIGEST_FEED_SCOPE;

describe('feed tokens', () => {
  it('round-trips a valid token', async () => {
    const token = await signFeedToken(SCOPE, SECRET);
    const res = await validateFeedToken(token, SCOPE, SECRET);
    expect(res.ok).toBe(true);
  });

  it('is deterministic within a month, so every subscriber shares one URL', async () => {
    const a = await signFeedToken(SCOPE, SECRET, new Date('2026-10-04T00:00:00Z'));
    const b = await signFeedToken(SCOPE, SECRET, new Date('2026-10-29T23:59:59Z'));
    expect(a).toBe(b);
    // ...and rolls over on the 1st, which is what makes expiry testable.
    const c = await signFeedToken(SCOPE, SECRET, new Date('2026-11-01T00:00:01Z'));
    expect(c).not.toBe(a);
  });

  it('is bound to its scope — a feed token cannot unlock another endpoint', async () => {
    const token = await signFeedToken(SCOPE, SECRET);
    // The whole point of mixing the path into the HMAC. Without it, a token
    // copied out of a feed URL would silently authorize /api/v1/cve-digest
    // and its CSV.
    for (const other of ['/api/v1/cve-digest', '/api/v1/cve-digest/csv', '/api/v1/admin/keys']) {
      const res = await validateFeedToken(token, other, SECRET);
      expect(res.ok, `${other} must reject a feed token`).toBe(false);
    }
  });

  it('rejects a token signed with a different secret (rotation revokes)', async () => {
    const token = await signFeedToken(SCOPE, SECRET);
    const res = await validateFeedToken(token, SCOPE, 'rotated-secret');
    expect(res.ok).toBe(false);
  });

  it('rejects tampered, truncated and malformed tokens', async () => {
    const token = await signFeedToken(SCOPE, SECRET);
    const [exp, sig] = token.split('.');
    const bad = [
      `${exp}.${sig.slice(0, -1)}0`, // flipped last nibble
      `${exp}.${sig.slice(0, 32)}`, // truncated signature
      token.slice(0, -4), // truncated token
      'garbage',
      '',
      `${exp}.`, // empty signature
      `.${sig}`, // empty expiry
      `${exp}x.${sig}`, // non-numeric expiry
    ];
    for (const t of bad) {
      const res = await validateFeedToken(t, SCOPE, SECRET);
      expect(res.ok, `"${t}" must be rejected`).toBe(false);
    }
  });

  it('fails closed with no secret, and does not throw on hostile input', async () => {
    expect((await validateFeedToken('anything', SCOPE, undefined)).ok).toBe(false);
    expect(feedTokenSecret({})).toBeUndefined();
    // signFeedToken throws rather than minting something guessable.
    await expect(signFeedToken(SCOPE, undefined)).rejects.toThrow();
    for (const t of [null, undefined, 42, {}, [], 'x'.repeat(5000)]) {
      expect((await validateFeedToken(t, SCOPE, SECRET)).ok).toBe(false);
    }
  });

  it('prefers a dedicated secret over INTERNAL_TOKEN_SECRET', () => {
    expect(feedTokenSecret({ FEED_TOKEN_SECRET: 'a', INTERNAL_TOKEN_SECRET: 'b' })).toBe('a');
    // Fallback so the feature works on a deploy that hasn't set one yet.
    expect(feedTokenSecret({ INTERNAL_TOKEN_SECRET: 'b' })).toBe('b');
  });

  it('expires at the first instant of the next UTC month', () => {
    const exp = new Date(monthlyExpiryMs(new Date('2026-10-15T12:00:00Z')));
    expect(exp.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    // A token minted on the last day of a month is still valid that day.
    expect(monthlyExpiryMs(new Date('2026-10-31T23:59:59Z'))).toBeGreaterThan(
      new Date('2026-10-31T23:59:59Z').getTime()
    );
  });

  it('registers only the RSS path as token-gated', () => {
    // A guard against widening this to a bulk-pull surface by accident.
    expect([...FEED_TOKEN_PATHS]).toEqual([CVE_DIGEST_FEED_SCOPE]);
  });
});

describe('cveDigestFeedUrlHandler', () => {
  it('mints a url that its own token unlocks, and 503s without a secret', async () => {
    const withSecret = { ...env, FEED_TOKEN_SECRET: SECRET } as never;
    const res = await cveDigestFeedUrlHandler({
      env: withSecret,
      req: { query: () => undefined },
      json: (b: unknown) => new Response(JSON.stringify(b), { status: 200 }),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expires: string };

    const key = new URL(body.url).searchParams.get('key');
    expect(key).toBeTruthy();
    expect((await validateFeedToken(key, SCOPE, SECRET)).ok).toBe(true);
    expect(new Date(body.expires).getTime()).toBeGreaterThan(Date.now());

    const noSecret = await cveDigestFeedUrlHandler({
      env: { FEED_TOKEN_SECRET: undefined, INTERNAL_TOKEN_SECRET: undefined } as never,
      req: { query: () => undefined },
      // Honour the status: `serviceUnavailable` is `c.json(body, 503)` and a
      // stub that always returns 200 would make this assertion vacuous.
      json: (b: unknown, status = 200) => new Response(JSON.stringify(b), { status }),
    } as never);
    expect(noSecret.status).toBe(503);
  });
});
