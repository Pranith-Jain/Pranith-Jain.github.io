/**
 * Required vs optional bindings. The "required" list is a soft guarantee:
 * the Worker starts with missing required bindings (D1/KV are all marked
 * optional in the Env type so dev/preview run cleanly), but production
 * deploys warn in the startup log and surface a 503 on every endpoint
 * that depends on the missing binding. Keeping this list explicit makes
 * "which binding is missing" a single grep away from an operator
 * debugging a `503 service_unavailable` on a route they expected to work.
 *
 * Tiers:
 *   - critical: a missing binding breaks a documented user-facing feature
 *     (e.g. BRIEFINGS_DB is required for /api/v1/briefings/*).
 *   - optional: a missing binding degrades a feature to "unsupported"
 *     (e.g. VECTORIZE when unset makes RAG query return 503).
 *
 * The `env` parameter is typed as a `Record<string, unknown>` so this
 * module can be imported by both `worker/` (where the type is the full
 * worker Env) and `api/` (where the type is a smaller Env with no
 * ASSETS / LIVE_FEED_DO / DFIR_MCP). At runtime the worker passes its
 * own env to apiApp via `env as never`, so the union shape is fine.
 */
export type BindingTier = 'critical' | 'optional';

export interface BindingSpec {
  key: string;
  tier: BindingTier;
  /** Human-readable feature this binding powers. */
  powers: string;
}

export const BINDING_SPECS: ReadonlyArray<BindingSpec> = [
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

export interface BindingStatus {
  key: string;
  tier: BindingTier;
  powers: string;
  bound: boolean;
}

export function getBindingStatus(env: Record<string, unknown>): BindingStatus[] {
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
export function validateRequiredBindings(env: Record<string, unknown>): {
  ok: boolean;
  missing: BindingStatus[];
} {
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
export function logStartupValidation(env: Record<string, unknown>): {
  ok: boolean;
  missing: BindingStatus[];
} {
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
