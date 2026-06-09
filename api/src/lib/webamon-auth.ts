import type { Env } from '../env';

const COMMUNITY_API = 'https://community.webamon.com';
const TIMEOUT_MS = 8000;

/**
 * Uses the legacy single API key as a Bearer token directly.
 * The Community API at community.webamon.com accepts the key as a Bearer
 * token without a client_id/client_secret exchange.
 */
export function getWebamonToken(env: Pick<Env, 'WEBAMON_API_KEY'>): string | null {
  return env.WEBAMON_API_KEY || null;
}

export async function authedFetch(
  env: Pick<Env, 'WEBAMON_API_KEY'>,
  path: string,
  init?: RequestInit
): Promise<Response | null> {
  const token = getWebamonToken(env);
  if (!token) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${COMMUNITY_API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { ...init?.headers, authorization: `Bearer ${token}` },
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}
