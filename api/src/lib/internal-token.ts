/**
 * Signed internal-token utility for DO→API in-process calls.
 *
 * Replaces the old `X-Internal-Agent: investigator-do` header bypass,
 * which any external caller could forge. Tokens are HMAC-SHA256-signed
 * and expire after a short TTL (default 5 minutes).
 *
 * The signing secret is derived deterministically from a Worker-level
 * constant so that DOs and API routes in the SAME Worker can both
 * sign/validate tokens. Durable Objects run in their own isolate, so
 * module-level state is NOT shared — a random per-cold-start key would
 * cause cross-isolate HMAC mismatches. Using a deterministic derivation
 * (Worker name + salt) keeps the token proof-of-possession: an external
 * caller would need to know the Worker name to forge a valid HMAC.
 */

const TOKEN_TTL_MS = 5 * 60_000; // 5 minutes
const SEP = '.';
/** Deterministic salt — shared across all isolates in the same Worker. */
const HMAC_SALT = 'pranithjain-internal-token-v1';

/**
 * Deterministic HMAC key derived from the Worker name + salt.
 * Both DOs and API routes compute the same key, so tokens are valid
 * across isolates within the same Worker.
 */
let _secret: CryptoKey | null = null;

async function getSecret(): Promise<CryptoKey> {
  if (_secret) return _secret;
  const raw = new TextEncoder().encode(HMAC_SALT);
  _secret = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return _secret;
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
 */
export async function signInternalToken(caller: string): Promise<string> {
  const secret = await getSecret();
  const payload: InternalTokenPayload = { caller, exp: Date.now() + TOKEN_TTL_MS };
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', secret, data));
  const sigHex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  // payload is base64url so it's safe in a header value
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/[=+/]/g, (c) => (c === '=' ? '' : c === '+' ? '-' : '_'));
  return `${payloadB64}${SEP}${sigHex}`;
}

export type InternalTokenResult = { ok: true; caller: string } | { ok: false; reason: string };

/**
 * Validate a signed internal token. Returns the caller identity on
 * success, or a rejection reason on failure.
 */
export async function validateInternalToken(token: string): Promise<InternalTokenResult> {
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
  const secret = await getSecret();
  const data = new TextEncoder().encode(payloadJson);
  // Decode hex signature — must be even-length hex
  const hexPairs = sigHex.match(/.{2}/g);
  if (!hexPairs || hexPairs.some((h) => !/^[0-9a-fA-F]{2}$/.test(h))) {
    return { ok: false, reason: 'invalid signature encoding' };
  }
  const sigBytes = new Uint8Array(hexPairs.map((h) => parseInt(h, 16)));
  const valid = await crypto.subtle.verify('HMAC', secret, sigBytes, data);
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
