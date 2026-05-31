export function safeErrorMessage(env: { DFIR_DEV_ERRORS?: string }, err: unknown): string {
  const isDev = env.DFIR_DEV_ERRORS === '1';
  if (isDev) return err instanceof Error ? err.message : String(err);
  return 'upstream error';
}
