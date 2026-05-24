/**
 * Operator admin token, shared across all mutation flows that hit a
 * gated `/api/v1/*` endpoint (campaigns, external-resources, telegram
 * custom channels, …). The pages each maintain their own UI for
 * pasting / clearing the token — this module is just the shared
 * accessor + header builder so we don't fork the storage key.
 */

const STORAGE_KEY = 'resources-admin-token';

export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

/**
 * Build a Headers object with `Authorization: Bearer <token>` set when
 * a token is stored locally. Returns a plain object so callers can
 * spread it next to a `content-type` etc.
 */
export function adminAuthHeaders(): Record<string, string> {
  const token = readAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
