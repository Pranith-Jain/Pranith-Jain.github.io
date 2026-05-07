import type { Context } from 'hono';
import type { Env } from '../env';
import { detectType } from '../lib/indicator';
import { sseStream } from '../lib/sse';
import { compositeScore } from '../lib/scoring';
import { ProviderCache } from '../lib/cache';
import { virustotal } from '../providers/virustotal';
import { abuseipdb } from '../providers/abuseipdb';
import { shodan } from '../providers/shodan';
import { greynoise } from '../providers/greynoise';
import { otx } from '../providers/otx';
import { urlscan } from '../providers/urlscan';
import { hybridanalysis } from '../providers/hybridanalysis';
import { pulsedive } from '../providers/pulsedive';
import {
  PROVIDER_SUPPORT,
  PROVIDER_TIMEOUT_MS,
  type ProviderAdapter,
  type ProviderId,
  type ProviderResult,
} from '../providers/types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  virustotal,
  abuseipdb,
  shodan,
  greynoise,
  otx,
  urlscan,
  hybridanalysis,
  pulsedive,
};

export async function iocCheckHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('indicator');
  if (!raw) return c.json({ error: 'missing indicator' }, 400);

  const type = detectType(raw);
  if (type === 'unknown') return c.json({ error: 'unrecognized indicator type' }, 400);

  const indicator = { type, value: raw.trim() };
  const cache = new ProviderCache(c.env.KV_CACHE);

  const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(type));

  return sseStream<unknown>(async (write) => {
    write('meta', { type, value: indicator.value, providers: eligible });

    const env = {
      VT_API_KEY: c.env.VT_API_KEY ?? '',
      ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
      SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
      GREYNOISE_API_KEY: c.env.GREYNOISE_API_KEY ?? '',
      OTX_API_KEY: c.env.OTX_API_KEY ?? '',
      URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
      HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
      PULSEDIVE_API_KEY: c.env.PULSEDIVE_API_KEY ?? '',
    };

    const collected: ProviderResult[] = [];
    await Promise.all(
      eligible.map(async (p) => {
        const cached = await cache.get(p, indicator);
        if (cached) {
          collected.push(cached);
          write('result', cached);
          return;
        }
        const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
        try {
          const r = await ADAPTERS[p](indicator, env, signal);
          collected.push(r);
          write('result', r);
          if (r.status === 'ok') await cache.set(p, indicator, r);
        } catch (err) {
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
      })
    );

    write('done', compositeScore(type, collected));
  });
}
