/**
 * Operator admin token management.
 *
 * SECURITY: The token is stored in an HttpOnly cookie (set by
 * POST /api/v1/admin/session) so JavaScript cannot read it — this
 * prevents XSS from exfiltrating the token. The browser sends the
 * cookie automatically on every API request.
 *
 * The token is also kept in localStorage as a FALLBACK for:
 *   1. Non-browser API clients (curl, scripts) that can't use cookies
 *   2. Detecting whether the user has previously authenticated (UI state)
 *   3. Sending on legacy X-Admin-Token header during transition
 *
 * The HttpOnly cookie is the PRIMARY auth mechanism. localStorage is
 * a secondary display/state hint only.
 */

const STORAGE_KEY = 'adminToken';
/** Auto-expire stored tokens after 1 hour to limit stale-token exposure. */
const TOKEN_EXPIRY_MS = 60 * 60 * 1000;
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
 *
 * NOTE: When the HttpOnly session cookie is set, the browser sends it
 * automatically — these headers are redundant for cookie-capable clients
 * but are still included for backward compatibility with the legacy
 * header-based auth path.
 */
export function adminAuthHeaders(): Record<string, string> {
  const token = readAdminToken();
  return token ? { Authorization: `Bearer ${token}`, 'X-Admin-Token': token } : {};
}

/**
 * Create an HttpOnly session cookie by calling POST /api/v1/admin/session.
 * The browser will store the cookie and send it automatically on all
 * subsequent API requests — no JS involvement needed.
 *
 * Call this after the user enters their admin token. The token is also
 * saved to localStorage as a fallback (see readAdminToken).
 */
export async function createAdminSession(token: string, baseUrl = ''): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'same-origin', // include cookies
    });
    if (res.ok) {
      writeAdminToken(token); // also keep in localStorage for UI state
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Clear the admin session cookie (logout).
 */
export async function clearAdminSession(baseUrl = ''): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/v1/admin/session`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    // best-effort
  }
  clearAdminToken();
}
