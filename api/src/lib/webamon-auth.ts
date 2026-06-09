import type { Env } from '../env';

const AUTH_URL = 'https://community.webamon.co.uk/auth';
const KV_KEY = 'webamon:bearer';
const BUFFER_S = 3600;

export async function getWebamonToken(
  env: Pick<Env, 'KV_CACHE' | 'WEBAMON_CLIENT_ID' | 'WEBAMON_CLIENT_SECRET'>
): Promise<string | null> {
  if (!env.WEBAMON_CLIENT_ID || !env.WEBAMON_CLIENT_SECRET) return null;

  const cached = await env.KV_CACHE?.get(KV_KEY);
  if (cached) return cached;

  try {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: env.WEBAMON_CLIENT_ID, client_secret: env.WEBAMON_CLIENT_SECRET }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { bearer?: string };
    if (!data.bearer) return null;

    const expiresAt = Date.now() + 86400_000 - BUFFER_S * 1000;
    env.KV_CACHE?.put(KV_KEY, data.bearer, { expiration: Math.floor(expiresAt / 1000) }).catch(() => {});
    return data.bearer;
  } catch {
    return null;
  }
}

export async function authedFetch(
  env: Pick<Env, 'KV_CACHE' | 'WEBAMON_CLIENT_ID' | 'WEBAMON_CLIENT_SECRET'>,
  path: string,
  init?: RequestInit
): Promise<Response | null> {
  const token = await getWebamonToken(env);
  if (!token) return null;
  try {
    return await fetch(`https://community.webamon.co.uk${path}`, {
      ...init,
      headers: { ...init?.headers, authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
}
