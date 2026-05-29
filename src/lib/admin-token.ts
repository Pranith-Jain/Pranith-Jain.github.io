/**
 * Operator admin token, shared across all mutation flows that hit a
 * gated `/api/v1/*` endpoint (case-study admin, campaigns,
 * external-resources, telegram custom channels, …).
 *
 * Uses the single localStorage key `adminToken` (shared with the
 * case-study admin UI). Sends the token on BOTH headers so every
 * backend gate works regardless of which header it checks:
 *   - Authorization: Bearer <token>
 *   - X-Admin-Token: <token>
 *
 * Security note: localStorage is accessible to any JS on the page.
 * This is acceptable because:
 *   1. script-src is nonce-based CSP (no inline script injection).
 *   2. The token is a shared operator secret, not per-user auth.
 *   3. The backend enforces rate-limiting on admin mutations.
 * For higher-security deployments, consider HttpOnly cookies.
 */

const STORAGE_KEY = 'adminToken';
/** Auto-expire stored tokens after 24 hours to limit stale-token exposure. */
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const TOKEN_TIMESTAMP_KEY = 'adminToken_setAt';

export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const ts = window.localStorage.getItem(TOKEN_TIMESTAMP_KEY);
    if (ts && Date.now() - Number(ts) > TOKEN_EXPIRY_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
      return null;
    }
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
    window.localStorage.setItem(TOKEN_TIMESTAMP_KEY, String(Date.now()));
  } catch {
    // Storage quota or private browsing — non-fatal.
  }
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
  } catch {
    // non-fatal
  }
}

/**
 * Build headers with the admin token set on both `Authorization: Bearer`
 * and `X-Admin-Token` so every backend admin gate (case-study, intel-bundle,
 * briefings, campaigns, etc.) is reachable regardless of which header it
 * checks.
 */
export function adminAuthHeaders(): Record<string, string> {
  const token = readAdminToken();
  return token ? { Authorization: `Bearer ${token}`, 'X-Admin-Token': token } : {};
}
