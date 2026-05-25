import type { Context } from 'hono';
import type { Env } from '../env';
import { detectType } from '../lib/indicator';
import { sseStream } from '../lib/sse';
import { claimSseSlot, SSE_MAX_CONCURRENT } from '../lib/sse-concurrency';
import { compositeScore } from '../lib/scoring';
import { admiraltyGrade } from '../lib/admiralty';
import { ProviderCache } from '../lib/cache';
import { trackEvent, visitorCountry } from '../lib/analytics';
import { isCircuitOpen, recordProviderFailure, recordProviderSuccess } from '../lib/circuit-breaker';
import { virustotal } from '../providers/virustotal';
import { abuseipdb } from '../providers/abuseipdb';
import { shodan } from '../providers/shodan';
import { censys } from '../providers/censys';
import { netlas } from '../providers/netlas';
import { otx } from '../providers/otx';
import { urlscan } from '../providers/urlscan';
import { hybridanalysis } from '../providers/hybridanalysis';
import { spamhaus } from '../providers/spamhaus';
import { tor } from '../providers/tor';
import { doh } from '../providers/doh';
import { openphish } from '../providers/openphish';
import { threatfox } from '../providers/threatfox';
import { urlhaus } from '../providers/urlhaus';
import { malwarebazaar } from '../providers/malwarebazaar';
import { hashlookup } from '../providers/hashlookup';
import { cinsarmy } from '../providers/cinsarmy';
import { bitwire } from '../providers/bitwire';
import { blocklistde } from '../providers/blocklistde';
import { binarydefense } from '../providers/binarydefense';
import { ipsum } from '../providers/ipsum';
import { phishingArmy } from '../providers/phishingArmy';
import { tweetfeed } from '../providers/tweetfeed';
import { greynoise } from '../providers/greynoise';
import { c2tracker } from '../providers/c2tracker';
import { sslbl } from '../providers/sslbl';
import { yaraify } from '../providers/yaraify';
import { phishtank } from '../providers/phishtank';
import { malwareworld } from '../providers/malwareworld';
import { emailrep } from '../providers/emailrep';
import { malpedia } from '../providers/malpedia';
import {
  PROVIDER_SUPPORT,
  PROVIDER_TIMEOUT_MS,
  type ProviderAdapter,
  type ProviderId,
  type ProviderResult,
} from '../providers/types';

/** Cloudflare Workers limit subrequests to 50 per invocation. Each feed-based
 *  provider makes at least 1 fetch(). Chunk execution so we never exceed the
 *  budget even when 25+ providers are eligible for a given indicator type. */
const PROVIDER_CHUNK_SIZE = 10;

async function runChunked<T>(items: T[], fn: (item: T) => Promise<void>, chunkSize: number): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(fn));
  }
}

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  virustotal,
  abuseipdb,
  shodan,
  censys,
  netlas,
  otx,
  urlscan,
  hybridanalysis,
  spamhaus,
  tor,
  doh,
  openphish,
  threatfox,
  urlhaus,
  malwarebazaar,
  hashlookup,
  cinsarmy,
  bitwire,
  blocklistde,
  binarydefense,
  ipsum,
  phishingArmy,
  tweetfeed,
  greynoise,
  c2tracker,
  sslbl,
  yaraify,
  phishtank,
  malwareworld,
  emailrep,
  malpedia,
};

export async function iocCheckHandler(c: Context<{ Bindings: Env }>) {
  // Accept `q` as an alias for `indicator`: several in-app pivots (blog post
  // IOC links, the IOC snapshot panel) link with `?q=`. Same alias fix
  // applied to cert-search — keep the lookup contract forgiving.
  const raw = c.req.query('indicator') ?? c.req.query('q');
  if (!raw) return c.json({ error: 'missing indicator' }, 400);

  const type = detectType(raw);
  if (type === 'unknown') return c.json({ error: 'unrecognized indicator type' }, 400);

  const indicator = { type, value: raw.trim() };
  const cache = new ProviderCache(c.env.KV_CACHE);

  // Concurrency cap: one client can't pin N parallel SSE streams open
  // and burn provider quota. The per-window rate limiter doesn't catch
  // this because long-held streams only count as 1 request at start.
  const ip = c.req.header('cf-connecting-ip') ?? 'anon';
  const slot = await claimSseSlot(c, ip);
  if (!slot) {
    return c.json(
      {
        error: 'sse_concurrent_limit',
        max_concurrent: SSE_MAX_CONCURRENT,
        retry_hint: 'wait for an existing stream to finish before opening another',
      },
      429,
      { 'retry-after': '5', 'cache-control': 'no-store' }
    );
  }

  const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(type));

  return sseStream<unknown>(async (write) => {
    write('meta', { type, value: indicator.value, providers: eligible });

    const env = {
      VT_API_KEY: c.env.VT_API_KEY ?? '',
      ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
      SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
      CENSYS_PAT: c.env.CENSYS_PAT ?? '',
      CENSYS_ORG_ID: c.env.CENSYS_ORG_ID ?? '',
      NETLAS_API_KEY: c.env.NETLAS_API_KEY ?? '',
      OTX_API_KEY: c.env.OTX_API_KEY ?? '',
      URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
      HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
      ABUSECH_AUTH_KEY: c.env.ABUSECH_AUTH_KEY,
    };

    const collected: ProviderResult[] = [];
    await runChunked(
      eligible,
      async (p) => {
        // Circuit breaker: skip providers that have failed repeatedly.
        if (await isCircuitOpen(p)) {
          const skipped: ProviderResult = {
            source: p,
            status: 'unsupported',
            score: 0,
            verdict: 'unknown',
            raw_summary: {},
            tags: ['circuit-open'],
            fetched_at: new Date().toISOString(),
            cached: false,
          };
          collected.push(skipped);
          write('result', skipped);
          return;
        }

        const cached = await cache.get(p, indicator);
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
            await cache.set(p, indicator, r);
            await recordProviderSuccess(p);
          } else {
            await recordProviderFailure(p);
          }
        } catch (err) {
          await recordProviderFailure(p);
          const errResult: ProviderResult = {
            source: p,
            status: 'error',
            score: 0,
            verdict: 'unknown',
            raw_summary: {},
            tags: [],
            error: err instanceof Error ? err.message : String(err),
            fetched_at: new Date().toISOString(),
            cached: false,
          };
          collected.push(errResult);
          write('result', errResult);
        }
      },
      PROVIDER_CHUNK_SIZE
    );

    const composite = compositeScore(type, collected);
    const admiralty = admiraltyGrade(
      type,
      collected.filter((r) => r.status === 'ok').map((r) => r.source)
    );
    write('done', { ...composite, admiralty });
    // Fire-and-forget telemetry: indicator type + verdict + contributing count.
    // No PII; the indicator value itself is never written to AE.
    trackEvent(c.env, 'ioc_check', {
      blobs: [type, composite.verdict, composite.confidence],
      doubles: [composite.score, composite.contributing],
      indexes: [visitorCountry(c.req.raw)],
    });
    // Release the concurrency slot via the request's executionCtx so
    // the response can close immediately. waitUntil keeps the worker
    // alive long enough to finish the KV decrement.
    c.executionCtx.waitUntil(slot.release());
  });
}
