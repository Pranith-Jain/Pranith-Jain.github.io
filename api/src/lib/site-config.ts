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
 *
 * ⚠️ SECURITY: when true this flag widens BOTH the CSRF guard and the
 * auth same-origin bypass to localhost origins. It must never be set in a
 * production deployment — checked at startup in worker/bindings.ts.
 */
export function getAllowedOrigins(env?: {
  SITE_URL?: string;
  ALLOW_DEV_ORIGINS?: string;
  TOOLS_HOST?: string;
}): string[] {
  const siteUrl = getSiteUrl(env);
  const origins = [siteUrl];
  // Tools surface: same app on a second front door, so its origin is exactly
  // as trusted as the apex. Omitting it makes the CORS preflight and the auth
  // same-origin bypass reject every request originating from
  // tools.pranithjain.qzz.io.
  const toolsHost = (env?.TOOLS_HOST ?? '').trim().toLowerCase();
  if (toolsHost) {
    const toolsOrigin = `https://${toolsHost}`;
    if (!origins.includes(toolsOrigin)) origins.push(toolsOrigin);
  }
  const allowDev = env?.ALLOW_DEV_ORIGINS === 'true';
  if (allowDev || siteUrl.includes('localhost')) {
    origins.push(...DEV_ALLOWED_ORIGINS);
  }
  return origins;
}
