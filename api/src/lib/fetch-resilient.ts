/**
 * Resilient upstream fetch.
 *
 * Many external providers (NVD, Cert Spotter, RDAP registries, Wayback,
 * LeakCheck, abuse.ch, ip-api …) rate-limit the shared Cloudflare Worker IP
 * pool. The recurring bug pattern across this codebase is: one `fetch`, no
 * retry, so a single transient 429/5xx fails the whole tool with a
 * "try again in a few minutes" message — even though the per-IP bucket
 * usually clears in seconds.
 *
 * `fetchResilient` centralizes the fix: bounded retries on 429/5xx and
 * network errors, honoring `Retry-After` (capped), with jittered backoff and
 * a per-attempt timeout. It RETURNS the final Response (even if !ok) so the
 * caller keeps full control of status handling; it only THROWS if every
 * attempt threw at the network layer.
 */

export interface ResilientOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Base backoff in ms (grows per attempt). Default 800. */
  baseDelayMs?: number;
  /** Backoff / Retry-After ceiling in ms. Default 3000. */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms (only applied when init has no signal). Default 8000. */
  timeoutMs?: number;
  /** Statuses worth retrying. Default: 429 + all 5xx. */
  retryStatuses?: (status: number) => boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function defaultRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function fetchResilient(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: ResilientOptions = {}
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseDelayMs ?? 800;
  const maxDelay = opts.maxDelayMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retryable = opts.retryStatuses ?? defaultRetryable;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Respect a caller-provided signal; otherwise bound each attempt.
      const reqInit: RequestInit = init?.signal ? init : { ...init, signal: AbortSignal.timeout(timeoutMs) };
      const res = await fetch(input, reqInit);
      if (res.ok || !retryable(res.status) || attempt === attempts) return res;
      const ra = parseInt(res.headers.get('retry-after') ?? '', 10);
      // Full jitter: randomize within the delay window to decorrelate
      // concurrent retry storms (thundering-herd mitigation).
      const baseDelay = Number.isFinite(ra) ? Math.min(ra * 1000, maxDelay) : base * attempt;
      const wait = Math.min(baseDelay * (0.5 + Math.random() * 0.5), maxDelay);
      await sleep(wait);
    } catch (err) {
      lastErr = err;
      if (attempt === attempts) throw err;
      await sleep(Math.min(base * attempt, maxDelay));
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type.
  throw lastErr instanceof Error ? lastErr : new Error('fetchResilient: exhausted');
}
