import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound } from '../lib/api-error';
import { listToolChains, getToolChain } from '../lib/agent/tool-chain';

const API_BASE = 'https://pranithjain.qzz.io';

const toolChainRouter = new Hono<{ Bindings: Env }>();

toolChainRouter.get('/tool-chains', async (c) => {
  return c.json({ chains: listToolChains() });
});

toolChainRouter.get('/tool-chains/:id', async (c) => {
  const chain = getToolChain(c.req.param('id'));
  if (!chain) return notFound(c, 'tool chain not found');
  return c.json(chain);
});

toolChainRouter.post('/tool-chains/:id/run', async (c) => {
  const chain = getToolChain(c.req.param('id'));
  if (!chain) return notFound(c, 'tool chain not found');

  let body: { indicator?: string };
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, 'invalid JSON body');
  }
  const indicator = body.indicator?.trim();
  if (!indicator) return badRequest(c, 'indicator is required');

  const context: Record<string, unknown> = { indicator };
  const stepResults: Array<{
    step: string;
    name: string;
    status: 'ok' | 'error';
    data?: unknown;
    error?: string;
    durationMs: number;
  }> = [];

  for (const step of chain.steps) {
    const start = Date.now();
    try {
      const params = step.buildParams(context);
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      const url = step.method === 'GET' ? `${API_BASE}${step.apiPath}?${qs}` : `${API_BASE}${step.apiPath}`;

      const fetchInit: RequestInit = {
        method: step.method,
        headers: { accept: 'application/json', 'x-internal-token': c.req.header('x-internal-token') ?? '' },
        signal: AbortSignal.timeout(15000),
      };
      if (step.method === 'POST') {
        fetchInit.body = JSON.stringify(params);
        (fetchInit.headers as Record<string, string>)['content-type'] = 'application/json';
      }

      const self = (c.env as { SELF?: Fetcher }).SELF;
      const res = self ? await self.fetch(new Request(url, fetchInit)) : await fetch(url, fetchInit);

      const data = res.ok ? await res.json().catch(() => null) : null;
      const status = res.ok ? 'ok' : 'error';

      if (step.extractKey && data) {
        Object.assign(context, step.extractKey(data));
      }

      stepResults.push({
        step: step.id,
        name: step.name,
        status,
        data,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      stepResults.push({
        step: step.id,
        name: step.name,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      });
    }
  }

  return c.json({
    chain_id: chain.id,
    chain_name: chain.name,
    indicator,
    steps: stepResults,
    summary: {
      total_steps: chain.steps.length,
      succeeded: stepResults.filter((s) => s.status === 'ok').length,
      failed: stepResults.filter((s) => s.status === 'error').length,
      total_duration_ms: stepResults.reduce((sum, s) => sum + s.durationMs, 0),
    },
  });
});

export { toolChainRouter };
