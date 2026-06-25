export const DEV_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8787',
];

export function getSiteUrl(env?: { SITE_URL?: string }): string {
  return env?.SITE_URL ?? 'https://pranithjain.qzz.io';
}

/**
 * Get allowed origins for CORS and auth same-origin checks.
 * In production (OPEN_PUBLIC_READS not set), dev origins are excluded
 * to prevent local development servers from making authenticated
 * requests to the production API.
 *
 * To include dev origins in production (e.g. for debugging), set
 * ALLOW_DEV_ORIGINS=true as a Worker secret.
 */
export function getAllowedOrigins(env?: { SITE_URL?: string; ALLOW_DEV_ORIGINS?: string }): string[] {
  const origins = [getSiteUrl(env)];
  const allowDev = env?.ALLOW_DEV_ORIGINS === 'true';
  if (allowDev || getSiteUrl(env).includes('localhost')) {
    origins.push(...DEV_ALLOWED_ORIGINS);
  }
  return origins;
}
