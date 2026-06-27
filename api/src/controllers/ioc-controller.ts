import type { Context } from 'hono';
import type { Env } from '../env';
import { detectType } from '../lib/indicator';
import { sseStream } from '../lib/sse';
import { claimSseSlot, SSE_MAX_CONCURRENT } from '../lib/sse-concurrency';
import { trackEvent, visitorCountry } from '../lib/analytics';
import { runIocProviders } from '../lib/ioc-providers';
import type { ProviderId } from '../providers/types';
import { ADAPTERS, PROVIDER_SUPPORT } from '../providers';

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

      const ip = c.req.header('cf-connecting-ip') ?? 'anon';
      const slot = await claimSseSlot(c, ip);
      if (!slot) {
        return c.json(
          { error: 'sse_concurrent_limit', max_concurrent: SSE_MAX_CONCURRENT, retry_hint: 'wait before retrying' },
          429,
          { 'retry-after': '5', 'cache-control': 'no-store' }
        );
      }

      if (type === 'cve' || type === 'email') {
        return c.json(
          {
            error: 'use_dedicated_route',
            type,
            message:
              type === 'cve'
                ? 'Use /api/v1/cve/lookup?id=… for CVE enrichment — the IOC fan-out has no real-time CVE providers.'
                : 'Use /api/v1/breach/email?email=… for email breach lookups — the IOC fan-out has no real-time email reputation providers.',
            redirect:
              type === 'cve'
                ? { path: '/api/v1/cve/lookup', param: 'id' }
                : { path: '/api/v1/breach/email', param: 'email' },
          },
          400
        );
      }

      const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(type));

      return sseStream<unknown>(async (write) => {
        write('meta', { type, value: raw.trim(), providers: eligible });
        const { composite, admiralty } = await runIocProviders(raw, c.env, (r) => write('result', r));
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
