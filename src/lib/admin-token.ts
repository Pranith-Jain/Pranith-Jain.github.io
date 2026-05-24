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
 */

const STORAGE_KEY = 'adminToken';

export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
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
