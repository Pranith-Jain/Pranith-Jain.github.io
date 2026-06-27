/**
 * Shared IOC provider fan-out — runs the full 27+ provider suite for any
 * indicator type. Used by both the SSE streaming IOC checker and the
 * non-streaming hunt-v2 handler.
 */

import type { Env } from '../env';
import { detectType } from './indicator';
import type { Indicator } from '../providers/types';
import { ProviderCache } from './cache';
import { isCircuitOpen, recordProviderFailure, recordProviderSuccess } from './circuit-breaker';
import { compositeScore } from './scoring';
import { admiraltyGrade } from './admiralty';
import type { ProviderResult, ProviderId } from '../providers/types';
import { ADAPTERS, buildProviderEnv, PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS } from '../providers';

const PROVIDER_CHUNK_SIZE = 10;

async function runChunked<T>(items: T[], fn: (item: T) => Promise<void>, size: number): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.allSettled(chunk.map(fn));
  }
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

export interface IocProviderRunResult {
  collected: ProviderResult[];
  composite: ReturnType<typeof compositeScore>;
  admiralty: ReturnType<typeof admiraltyGrade>;
  eligible: ProviderId[];
}

/**
 * Run the full provider fan-out for an indicator. Returns collected results,
 * composite score, and admiralty grade — everything downstream consumers need.
 */
export async function runIocProviders(
  raw: string,
  env: Env,
  onResult?: (r: ProviderResult) => void
): Promise<IocProviderRunResult> {
  const type = detectType(raw);
  const indicator: Indicator = { type, value: raw.trim() };
  const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(type));
  const providerEnv = buildProviderEnv(env);
  const cache = new ProviderCache(env.KV_CACHE);

  const collected: ProviderResult[] = [];

  await cache.primeBatch(indicator);
  await runChunked(
    eligible,
    async (p) => {
      if (isCircuitOpen(p)) {
        const skipped = makeSkippedResult(p);
        collected.push(skipped);
        onResult?.(skipped);
        return;
      }
      const cached = cache.getBatched(p);
      if (cached) {
        collected.push(cached);
        onResult?.(cached);
        await recordProviderSuccess(p);
        return;
      }
      const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
      try {
        const r = await ADAPTERS[p](indicator, providerEnv, signal);
        collected.push(r);
        onResult?.(r);
        if (r.status === 'ok') {
          cache.stageBatched(p, indicator, r);
          await recordProviderSuccess(p);
        } else {
          recordProviderFailure(p);
        }
      } catch (err) {
        recordProviderFailure(p);
        const errResult = makeErrorResult(p, err);
        collected.push(errResult);
        onResult?.(errResult);
      }
    },
    PROVIDER_CHUNK_SIZE
  );
  await cache.flushBatch(indicator);

  const composite = compositeScore(type, collected);
  const adv = admiraltyGrade(
    type,
    collected.filter((r) => r.status === 'ok').map((r) => r.source)
  );

  return { collected, composite, admiralty: adv, eligible };
}
