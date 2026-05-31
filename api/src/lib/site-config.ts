export const DEV_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8787',
];

export function getSiteUrl(env?: { SITE_URL?: string }): string {
  return env?.SITE_URL ?? 'https://pranithjain.qzz.io';
}

export function getAllowedOrigins(env?: { SITE_URL?: string }): string[] {
  return [getSiteUrl(env), ...DEV_ALLOWED_ORIGINS];
}
