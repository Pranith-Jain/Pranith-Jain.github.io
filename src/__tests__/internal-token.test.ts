import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signInternalToken, validateInternalToken } from '../../api/src/lib/internal-token';

describe('internal-token', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('signs and validates a token with an explicit secret', async () => {
    const secret = 'test-secret-' + Date.now();
    const token = await signInternalToken('investigator-do', secret);
    const result = await validateInternalToken(token, secret);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.caller).toBe('investigator-do');
    }
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signInternalToken('cron', 'secret-a');
    const result = await validateInternalToken(token, 'secret-b');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid signature');
    }
  });

  it('rejects an expired token', async () => {
    const secret = 'test-secret-expiry';
    const token = await signInternalToken('cron', secret);

    // Manipulate the payload to set exp in the past
    const sepIdx = token.lastIndexOf('.');
    const payloadB64 = token.slice(0, sepIdx);
    const sigHex = token.slice(sepIdx + 1);
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    payload.exp = Date.now() - 1000; // expired 1 second ago
    const newPayloadB64 = btoa(JSON.stringify(payload)).replace(/[=+/]/g, (c: string) =>
      c === '=' ? '' : c === '+' ? '-' : '_'
    );
    const expiredToken = `${newPayloadB64}.${sigHex}`;

    const result = await validateInternalToken(expiredToken, secret);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Expiry is checked first, so we get 'token expired' even though
      // the signature is also invalid (payload was tampered with).
      expect(result.reason).toBe('token expired');
    }
  });

  it('rejects a malformed token', async () => {
    const result = await validateInternalToken('not-a-token', 'secret');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed token');
    }
  });

  it('works with the deterministic fallback (no secret)', async () => {
    const token = await signInternalToken('report-builder-do');
    const result = await validateInternalToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.caller).toBe('report-builder-do');
    }
  });

  it('fallback token is forgeable without the salt', async () => {
    const token = await signInternalToken('cron');
    // Validate with a different (wrong) secret — would fail if real secret were used
    const result = await validateInternalToken(token, 'some-other-secret');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid signature');
    }
  });
});
