/**
 * Signed internal-token utility for DO→API in-process calls.
 *
 * Replaces the old `X-Internal-Agent: investigator-do` header bypass,
 * which any external caller could forge. Tokens are HMAC-SHA256-signed
 * and expire after a short TTL (default 5 minutes).
 *
 * The signing secret is provided via the `INTERNAL_TOKEN_SECRET` Worker
 * secret (set with `wrangler secret put INTERNAL_TOKEN_SECRET`). Both DOs
 * and API routes receive the same secret through the env binding, so
 * tokens are valid across isolates within the same Worker.
 *
 * FALLBACK: When `INTERNAL_TOKEN_SECRET` is not set (e.g. local dev),
 * the module falls back to a deterministic derivation for backward
 * compatibility. This path MUST NOT be used in production.
 */

const TOKEN_TTL_MS = 5 * 60_000; // 5 minutes
const SEP = '.';
/** Legacy deterministic fallback — only used when INTERNAL_TOKEN_SECRET is unset. */
const FALLBACK_HMAC_SALT = 'pranithjain-internal-token-v1';

/** Cache the derived CryptoKey per secret value. */
let _cachedSecret: string | null = null;
let _cachedKey: CryptoKey | null = null;

async function getSecret(secret?: string): Promise<CryptoKey> {
  const raw = secret ?? FALLBACK_HMAC_SALT;
  if (_cachedSecret === raw && _cachedKey) return _cachedKey;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  _cachedSecret = raw;
  _cachedKey = key;
  return key;
}

export interface InternalTokenPayload {
  /** Caller identity — e.g. 'investigator-do', 'report-builder-do'. */
  caller: string;
  /** Unix-ms expiry timestamp. */
  exp: number;
}

/**
 * Generate a signed internal token. Called by Durable Objects before
 * making in-process API calls via the SELF service binding.
 *
 * @param caller - Caller identity (e.g. 'investigator-do')
 * @param secret - The INTERNAL_TOKEN_SECRET from env. When provided, uses
 *   a cryptographically random secret instead of the deterministic fallback.
 */
export async function signInternalToken(caller: string, secret?: string): Promise<string> {
  const key = await getSecret(secret);
  const payload: InternalTokenPayload = { caller, exp: Date.now() + TOKEN_TTL_MS };
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const sigHex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  // payload is base64url so it's safe in a header value
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/[=+/]/g, (c) => (c === '=' ? '' : c === '+' ? '-' : '_'));
  return `${payloadB64}${SEP}${sigHex}`;
}

export type InternalTokenResult = { ok: true; caller: string } | { ok: false; reason: string };

/**
 * Validate a signed internal token. Returns the caller identity on
 * success, or a rejection reason on failure.
 *
 * @param token - The signed token to validate
 * @param secret - The INTERNAL_TOKEN_SECRET from env. When provided, uses
 *   the secret-based key instead of the deterministic fallback.
 */
export async function validateInternalToken(token: string, secret?: string): Promise<InternalTokenResult> {
  const sepIdx = token.lastIndexOf(SEP);
  if (sepIdx < 0) return { ok: false, reason: 'malformed token' };

  const payloadB64 = token.slice(0, sepIdx);
  const sigHex = token.slice(sepIdx + 1);

  // Reconstruct the original JSON from base64url
  let payloadJson: string;
  try {
    // Reverse base64url → base64
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    // Pad to a multiple of 4
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    payloadJson = atob(padded);
  } catch {
    return { ok: false, reason: 'invalid payload encoding' };
  }

  let payload: InternalTokenPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, reason: 'invalid payload json' };
  }

  if (typeof payload.exp !== 'number' || typeof payload.caller !== 'string') {
    return { ok: false, reason: 'missing fields' };
  }

  // Check expiry
  if (Date.now() > payload.exp) {
    return { ok: false, reason: 'token expired' };
  }

  // Verify HMAC signature
  const key = await getSecret(secret);
  const data = new TextEncoder().encode(payloadJson);
  // Decode hex signature — must be even-length hex
  const hexPairs = sigHex.match(/.{2}/g);
  if (!hexPairs || hexPairs.some((h) => !/^[0-9a-fA-F]{2}$/.test(h))) {
    return { ok: false, reason: 'invalid signature encoding' };
  }
  const sigBytes = new Uint8Array(hexPairs.map((h) => parseInt(h, 16)));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!valid) {
    return { ok: false, reason: 'invalid signature' };
  }

  return { ok: true, caller: payload.caller };
}

/**
 * Allowed caller identities. Reject any token with an unknown caller
 * to prevent an attacker from crafting tokens with arbitrary caller
 * values (even if they can't forge the signature, defence-in-depth).
 */
export const ALLOWED_INTERNAL_CALLERS = new Set(['investigator-do', 'report-builder-do', 'cron']);
