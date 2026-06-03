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
import type { ProviderResult, ProviderId, ProviderAdapter, ProviderEnv } from '../providers/types';
import { PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS } from '../providers/types';
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
import { malshare } from '../providers/malshare';
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
import { pulsedive } from '../providers/pulsedive';
import { shodanInternetDB } from '../providers/shodan-internetdb';
import { spur } from '../providers/spur';
import { crowdsec } from '../providers/crowdsec';
import { ipinfo } from '../providers/ipinfo';
import { phishstats } from '../providers/phishstats';
import { feodo } from '../providers/feodo';
import { digitalside } from '../providers/digitalside';
import { criminalip } from '../providers/criminalip';
import { certpl } from '../providers/certpl';
import { x4bnet } from '../providers/x4bnet';
import { kaspersky } from '../providers/kaspersky';
import { cape } from '../providers/cape';

const PROVIDER_CHUNK_SIZE = 10;

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
  malshare,
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
  pulsedive,
  'shodan-internetdb': shodanInternetDB,
  spur,
  crowdsec,
  ipinfo,
  phishstats,
  feodo,
  digitalside,
  criminalip,
  certpl,
  x4bnet,
  kaspersky,
  cape,
};

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

function buildProviderEnv(c: Context<{ Bindings: Env }>): ProviderEnv {
  return {
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
    MALSHARE_API_KEY: c.env.MALSHARE_API_KEY,
    CROWDSEC_API_KEY: c.env.CROWDSEC_API_KEY,
    IPINFO_TOKEN: c.env.IPINFO_TOKEN,
    CRIMINALIP_API_KEY: c.env.CRIMINALIP_API_KEY,
    KASPERSKY_API_KEY: c.env.KASPERSKY_API_KEY,
    SPUR_API_KEY: c.env.SPUR_API_KEY,
    CAPE_BRIDGE_URL: c.env.CAPE_BRIDGE_URL,
    CAPE_BRIDGE_TOKEN: c.env.CAPE_BRIDGE_TOKEN,
  };
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
      const providerEnv = buildProviderEnv(c);
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
