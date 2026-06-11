import type { Context } from 'hono';
import type { Env } from '../env';
import { detectType } from '../lib/indicator';
import type { Indicator } from '../providers/types';
import { sseStream } from '../lib/sse';
import { claimSseSlot, SSE_MAX_CONCURRENT } from '../lib/sse-concurrency';
import { compositeScore } from '../lib/scoring';
import { admiraltyGrade } from '../lib/admiralty';
import { ProviderCache } from '../lib/cache';
import { trackEvent, visitorCountry } from '../lib/analytics';
import { isCircuitOpen, recordProviderFailure, recordProviderSuccess } from '../lib/circuit-breaker';
import type { ProviderResult, ProviderId, ProviderEnv } from '../providers/types';
import { ADAPTERS, buildProviderEnv, PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS } from '../providers';

const PROVIDER_CHUNK_SIZE = 10;

/**
 * Process items in chunks of `size` with parallel execution within each chunk.
 * Uses iterative loop instead of recursion to avoid stack overflow with
 * large provider lists in Cloudflare Workers.
 */
async function runChunked<T>(items: T[], fn: (item: T) => Promise<void>, size: number): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    // Use allSettled so one provider failure doesn't block the entire chunk
    await Promise.allSettled(chunk.map(fn));
  }
}

export interface IocController {
  check(c: Context<{ Bindings: Env }>): Response | Promise<Response>;
}

export function createIocController(): IocController {
  return {
    async check(c: Context<{ Bindings: Env }>) {
      const raw = c.req.query('indicator') ?? c.req.query('q');
      if (!raw) return c.json({ error: 'missing indicator' }, 400);
      const type = detectType(raw);
      if (type === 'unknown') return c.json({ error: 'unrecognized indicator type' }, 400);
      const indicator: Indicator = { type, value: raw.trim() };

      const ip = c.req.header('cf-connecting-ip') ?? 'anon';
      const slot = await claimSseSlot(c, ip);
      if (!slot) {
        return c.json(
          { error: 'sse_concurrent_limit', max_concurrent: SSE_MAX_CONCURRENT, retry_hint: 'wait before retrying' },
          429,
          { 'retry-after': '5', 'cache-control': 'no-store' }
        );
      }

      const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(type));
      const providerEnv = buildProviderEnv(c.env);
      const cache = new ProviderCache(c.env.KV_CACHE);

      return sseStream<unknown>(async (write) => {
        write('meta', { type, value: indicator.value, providers: eligible });
        const collected = await runProviderChecks(eligible, indicator, providerEnv, cache, write);
        const composite = compositeScore(type, collected);
        const admiralty = admiraltyGrade(
          type,
          collected.filter((r) => r.status === 'ok').map((r) => r.source)
        );
        write('done', { ...composite, admiralty });
        trackEvent(c.env, 'ioc_check', {
          blobs: [type, composite.verdict, composite.confidence],
          doubles: [composite.score, composite.contributing],
          indexes: [visitorCountry(c.req.raw)],
        });
        c.executionCtx.waitUntil(slot.release());
      });
    },
  };
}

async function runProviderChecks(
  eligible: ProviderId[],
  indicator: Indicator,
  env: ProviderEnv,
  cache: ProviderCache,
  write: (event: string, data: unknown) => void
): Promise<ProviderResult[]> {
  const collected: ProviderResult[] = [];
  // One KV read for the whole indicator (vs. one per provider) keeps the
  // fan-out under the Workers Free-plan 50-subrequests-per-invocation limit.
  await cache.primeBatch(indicator);
  await runChunked(
    eligible,
    async (p) => {
      if (isCircuitOpen(p)) {
        const skipped = makeSkippedResult(p);
        collected.push(skipped);
        write('result', skipped);
        return;
      }
      const cached = cache.getBatched(p);
      if (cached) {
        collected.push(cached);
        write('result', cached);
        await recordProviderSuccess(p);
        return;
      }
      const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
      try {
        const r = await ADAPTERS[p](indicator, env, signal);
        collected.push(r);
        write('result', r);
        if (r.status === 'ok') {
          cache.stageBatched(p, indicator, r);
          await recordProviderSuccess(p);
        } else {
          await recordProviderFailure(p);
        }
      } catch (err) {
        await recordProviderFailure(p);
        const errResult = makeErrorResult(p, err);
        collected.push(errResult);
        write('result', errResult);
      }
    },
    PROVIDER_CHUNK_SIZE
  );
  // One KV write persists every freshly-fetched provider result for this
  // indicator (vs. one put per provider).
  await cache.flushBatch(indicator);
  return collected;
}

function makeSkippedResult(source: ProviderId): ProviderResult {
  return {
    source,
    status: 'unsupported',
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: ['circuit-open'],
    fetched_at: new Date().toISOString(),
    cached: false,
  };
}

function makeErrorResult(source: ProviderId, err: unknown): ProviderResult {
  return {
    source,
    status: 'error',
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    error: err instanceof Error ? err.message : String(err),
    fetched_at: new Date().toISOString(),
    cached: false,
  };
}
