const DEV_ENV_FLAG = 'DFIR_DEV_ERRORS';

export function safeErrorMessage(env: Record<string, unknown>, err: unknown): string {
  const isDev = String(env[DEV_ENV_FLAG] ?? '') === '1';
  if (isDev) return err instanceof Error ? err.message : String(err);
  return 'upstream error';
}
