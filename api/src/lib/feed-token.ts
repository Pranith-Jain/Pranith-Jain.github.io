/**
 * Signed, path-scoped feed tokens — public-by-link access for feeds.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * An RSS feed that requires an API key is not a feed. Real clients (Feedly,
 * Inoreader, FreshRSS, `curl` in a cron job) send no `Sec-Fetch-Site`, no
 * `Origin`, no `Referer` and no `Authorization` header, so
 * `authenticate('external-only')` rejects every one of them with a 401. The
 * established fix elsewhere in this codebase is `EXEMPT_PATHS` — but that
 * makes the feed world-readable and enumerable by anyone who guesses the URL.
 *
 * A signed token in the query string is the standard "secret feed URL" answer
 * (what Feedly and every newsletter platform do): the feed works in any
 * reader, the URL is unguessable, and the credential can be revoked by
 * rotating the secret rather than by hunting down subscribers.
 *
 * ── Scope binding ────────────────────────────────────────────────────────
 * The scope IS the request path, and it is mixed into the HMAC. A token
 * minted for `/api/v1/cve-digest/rss` therefore fails to verify against
 * `/api/v1/cve-digest` or `/api/v1/cve-digest/csv`. Without this, a token
 * copied out of a feed URL would silently unlock every other endpoint on the
 * site that accepts `?key=`.
 *
 * ── Deterministic monthly expiry ──────────────────────────────────────────
 * `exp` is the first instant of the next UTC month, so the token is a pure
 * function of (scope, secret, month). That buys three things:
 *   1. Every subscriber gets the SAME url, so the feed body is a single
 *      shared edge-cache entry instead of one per reader.
 *   2. Tokens don't accumulate — no per-user secret sprawl to revoke.
 *   3. Revocation is a secret rotation (`wrangler secret put FEED_TOKEN_SECRET`)
 *      or simply waiting out the month; there is no user table.
 * The cost is that a leaked link is good for up to ~31 days, which is the
 * same trade every secret-feed-URL product makes.
 *
 * ── Honest threat model ───────────────────────────────────────────────────
 * This is link-sharing-grade secrecy, NOT a hard boundary. `isSameOrigin()`
 * in `auth.ts` already documents that its header heuristics are forgeable by
 * any non-browser client, so a determined scraper that can reach the site can
 * mint its own token. What this buys over `EXEMPT_PATHS` is that the feed is
 * not *trivially* enumerable — the URL is 64 hex characters of HMAC.
 * Hard protection for these routes would be an API key, which is exactly what
 * the JSON and CSV endpoints keep.
 *
 * Set the secret with `wrangler secret put FEED_TOKEN_SECRET`. When it is
 * unset the module falls back to `INTERNAL_TOKEN_SECRET` (already configured,
 * and domain-separated by the `feed-v1` message prefix, so a feed token can
 * never be replayed as an internal token or vice versa). With neither set the
 * module fails closed: signing throws and validation rejects.
 */

import type { Context } from 'hono';
import type { Env } from '../env';

const SEP = '.';
/** Domain separation — a feed token is never a valid internal token. */
const MSG_PREFIX = 'feed-v1';
/** Longest token accepted, to bound the HMAC work on a hostile input. */
const MAX_TOKEN_LENGTH = 200;

/**
 * Paths whose access may be granted by a `?key=` feed token.
 *
 * Deliberately NOT the RSS/CSV exports' siblings: the JSON digest and its CSV
 * stay behind the API key, because they are the bulk-pull surfaces. Add a path
 * here only when a real non-browser client has to fetch it.
 */
export const FEED_TOKEN_PATHS: ReadonlySet<string> = new Set(['/api/v1/cve-digest/rss']);

/** First instant of the next UTC month — see the module note on determinism. */
export function monthlyExpiryMs(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

/** Cache the derived CryptoKey per secret value (mirrors internal-token.ts). */
let _cachedSecret: string | null = null;
let _cachedKey: CryptoKey | null = null;

async function getKey(secret: string): Promise<CryptoKey> {
  if (_cachedSecret === secret && _cachedKey) return _cachedKey;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  _cachedSecret = secret;
  _cachedKey = key;
  return key;
}

function message(scope: string, expSeconds: number): Uint8Array {
  return new TextEncoder().encode(`${MSG_PREFIX}|${scope}|${expSeconds}`);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function requireSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error(
      'No feed token secret configured. Set FEED_TOKEN_SECRET (or INTERNAL_TOKEN_SECRET) via `wrangler secret put`.'
    );
  }
  return secret;
}

/**
 * The signing secret. A dedicated `FEED_TOKEN_SECRET` wins so the feed
 * credential can be rotated independently of the internal-token secret; the
 * fallback exists so this feature works on a deploy that has not set one.
 */
export function feedTokenSecret(env: {
  FEED_TOKEN_SECRET?: string;
  INTERNAL_TOKEN_SECRET?: string;
}): string | undefined {
  return env.FEED_TOKEN_SECRET || env.INTERNAL_TOKEN_SECRET || undefined;
}

/** Mint a feed token. Throws when no secret is configured (fails closed). */
export async function signFeedToken(scope: string, secret: string | undefined, now?: Date): Promise<string> {
  const raw = requireSecret(secret);
  const exp = Math.floor(monthlyExpiryMs(now) / 1000);
  const sig = await crypto.subtle.sign('HMAC', await getKey(raw), message(scope, exp));
  return `${exp}${SEP}${toHex(new Uint8Array(sig))}`;
}

export type FeedTokenResult = { ok: true; exp: number } | { ok: false; reason: string };

/** Verify a token against one scope. Never throws. */
export async function validateFeedToken(
  token: unknown,
  scope: string,
  secret: string | undefined
): Promise<FeedTokenResult> {
  if (!secret) return { ok: false, reason: 'feed token secret not configured' };
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'malformed token' };
  }
  const sep = token.lastIndexOf(SEP);
  if (sep <= 0) return { ok: false, reason: 'malformed token' };

  const expRaw = token.slice(0, sep);
  const sigHex = token.slice(sep + 1);
  // Epoch seconds: 10 digits now, 11 in 2286. Cheap sanity bound before the HMAC.
  if (!/^\d{10,11}$/.test(expRaw)) return { ok: false, reason: 'malformed expiry' };
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp)) return { ok: false, reason: 'malformed expiry' };
  if (Date.now() > exp * 1000) return { ok: false, reason: 'token expired' };

  // Exactly one SHA-256 signature, hex-encoded.
  if (sigHex.length !== 64 || !/^[0-9a-f]+$/.test(sigHex)) return { ok: false, reason: 'invalid signature encoding' };
  const sig = new Uint8Array(sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

  const valid = await crypto.subtle.verify('HMAC', await getKey(secret), sig, message(scope, exp));
  if (!valid) return { ok: false, reason: 'invalid signature' };
  return { ok: true, exp };
}

/**
 * The token off a request, or null. `token` is accepted as an alias because
 * `key` reads like a query-string CSRF parameter in other tooling.
 */
export function readFeedToken(c: Context<{ Bindings: Env }>): string | null {
  const q = c.req.query('key') ?? c.req.query('token');
  return typeof q === 'string' && q.length > 0 ? q : null;
}

/**
 * True when this request carries a valid token for its own path.
 *
 * Called from the auth middleware, so it must stay cheap: one SHA-256 verify,
 * no I/O, and a `Set` lookup first so the common (non-feed) request never
 * reaches the crypto at all.
 */
export async function feedTokenUnlocks(c: Context<{ Bindings: Env }>): Promise<boolean> {
  if (!FEED_TOKEN_PATHS.has(c.req.path)) return false;
  const token = readFeedToken(c);
  if (!token) return false;
  const result = await validateFeedToken(token, c.req.path, feedTokenSecret(c.env));
  return result.ok;
}
