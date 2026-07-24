/**
 * Authenticated self-fetch helper for in-process API calls.
 *
 * Workers cannot fetch their own public URL (Cloudflare blocks loopback),
 * so routes use env.SELF.fetch() to call other /api/v1/* endpoints.
 * However, the auth middleware requires API keys for external callers.
 *
 * This helper signs an internal token (HMAC-SHA256, same mechanism DOs use)
 * and passes it via x-internal-token header, which the auth middleware
 * validates and allows through without an API key.
 */
import { signInternalToken } from './internal-token';

interface SelfFetcher {
  fetch: (req: RequestInfo, init?: RequestInit) => Promise<Response>;
}

interface TokenEnv {
  INTERNAL_TOKEN_SECRET?: string;
}

const CALLER = 'cron';

/**
 * Make an authenticated in-process fetch via the SELF service binding.
 * Returns null on any error (network, auth, non-OK status).
 */
export async function selfFetchJson<T>(self: SelfFetcher | undefined, path: string, env?: TokenEnv): Promise<T | null> {
  if (!self) return null;
  try {
    const url = `https://self${path}`;
    const tokenSecret = env?.INTERNAL_TOKEN_SECRET;
    if (!tokenSecret) return null;
    const token = await signInternalToken(CALLER, tokenSecret);
    const req = new Request(url, {
      headers: { accept: 'application/json', 'x-internal-token': token },
    });
    const res = await self.fetch(req);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
