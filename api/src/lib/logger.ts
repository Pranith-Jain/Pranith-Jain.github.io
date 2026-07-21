/**
 * Structured logging helper for Cloudflare Workers.
 *
 * Cloudflare Workers logs are ingested by observability pipelines that parse
 * JSON lines. Unstructured `console.log("foo:", bar)` produces text that's
 * hard to search, filter, and alert on. This helper emits structured JSON
 * with consistent fields so every log line is machine-parseable.
 *
 * Usage:
 *   log('info', 'publisher', { published: 1, slug: 'foo' });
 *   // → {"ts":"2026-07-21T12:00:00.000Z","level":"info","job":"publisher","published":1,"slug":"foo"}
 *
 * Error logging preserves the stack trace:
 *   log('error', 'social-post', { slug, error: err.message, stack: err.stack });
 */

export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, job: string, extra?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    job,
    ...extra,
  };
  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}

/** Shortcut for logging an Error with stack trace. */
export function logError(job: string, error: unknown, extra?: Record<string, unknown>): void {
  log('error', job, {
    ...extra,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

/** Wrapper that standardises `.catch` handler logging. */
export function catchLog(job: string, extra?: Record<string, unknown>) {
  return (error: unknown) => {
    logError(job, error, extra);
  };
}
