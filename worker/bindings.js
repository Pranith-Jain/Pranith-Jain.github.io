export const BINDING_SPECS = [
  { key: 'BRIEFINGS_DB', tier: 'critical', powers: '/api/v1/briefings/*, intel-bundle, observable-db, investigations' },
  { key: 'KV_CACHE', tier: 'critical', powers: 'edge rate-limit counters, persisted feed-scheduler jobs' },
  {
    key: 'CASE_STUDIES',
    tier: 'critical',
    powers: 'auto-discovered case-study pipeline (KV) — discovery, planning, publishing',
  },
  { key: 'AI', tier: 'optional', powers: '/api/v1/ai-summary, /api/v1/copilot/investigate, LLM enrichers' },
  { key: 'VECTORIZE', tier: 'optional', powers: '/api/v1/rag/query, semantic search' },
  { key: 'LIVE_FEED_DO', tier: 'optional', powers: '/api/v1/ws/live-feed WebSocket' },
  { key: 'DFIR_MCP', tier: 'optional', powers: '/api/mcp (DFIR MCP server)' },
  { key: 'CRON_LOCK_DO', tier: 'optional', powers: 'cron single-flight lease (overlap guard)' },
  { key: 'FEEDS_QUEUE', tier: 'optional', powers: 'live-iocs per-source feed fan-out (slice warmer)' },
  { key: 'ASSETS', tier: 'critical', powers: 'static SPA assets, prerendered HTML' },
  // Case-study generation secrets. Each is optional (the pipeline degrades
  // independently), but a missing one is a silent feature regression — the
  // /health endpoint + startup log now flag their presence so a fresh
  // deploy that forgot to set GROQ_API_KEY doesn't ship 429-failing posts.
  {
    key: 'GROQ_API_KEY',
    tier: 'optional',
    powers: 'case-study LLM (primary provider; falls back to Workers AI when unset)',
  },
  {
    key: 'VULNCHECK_API_TOKEN',
    tier: 'optional',
    powers: 'case-study KEV enrichment (vulncheck runner no-ops when unset)',
  },
  {
    key: 'BLOG_APPROVAL_REQUIRED',
    tier: 'optional',
    powers: 'case-study approval gate (set to "true" to require human approval; unset = auto-publish)',
  },
];
export function getBindingStatus(env) {
  return BINDING_SPECS.map((spec) => ({
    key: spec.key,
    tier: spec.tier,
    powers: spec.powers,
    bound: env[spec.key] != null,
  }));
}
/**
 * Validate required bindings on Worker cold-start. Returns a flag
 * indicating whether all critical bindings are present; the result is
 * also written to the startup log so operators can spot a misconfigured
 * deploy from `wrangler tail` without needing to hit a route first.
 *
 * The function is pure (no I/O); the caller is responsible for the
 * once-per-instance memoization. `logStartupValidation` is the
 * convenience wrapper that does both.
 */
export function validateRequiredBindings(env) {
  const status = getBindingStatus(env);
  const missing = status.filter((s) => s.tier === 'critical' && !s.bound);
  return { ok: missing.length === 0, missing };
}
let lastValidatedAt = 0;
const VALIDATE_DEBOUNCE_MS = 60_000; // re-log at most once per minute
/**
 * One-shot binding validator. Logs a structured warning to the Worker's
 * startup log when critical bindings are missing. Subsequent calls
 * within the debounce window are no-ops to avoid log spam from warm
 * instances.
 *
 * Safe to call on every request — the cost is one `getBindingStatus`
 * pass and a timestamp comparison.
 */
export function logStartupValidation(env) {
  const result = validateRequiredBindings(env);
  if (result.ok) return result;
  if (Date.now() - lastValidatedAt < VALIDATE_DEBOUNCE_MS) return result;
  lastValidatedAt = Date.now();
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'startup_binding_validation',
      ok: false,
      missing: result.missing.map((m) => ({ key: m.key, powers: m.powers })),
    })
  );
  return result;
}
