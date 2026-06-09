import type { Context } from 'hono';
import type { Env } from '../env';
import { createCveController } from '../controllers';
import { createKvCveRepository } from '../infrastructure/persistence/kv-cve-repository';
import { vulncheckCve } from '../lib/vulncheck';

export async function cveSearchHandler(c: Context<{ Bindings: Env }>) {
  const repo = createKvCveRepository(c.env.KV_CACHE);
  const controller = createCveController(repo);
  const res = await controller.search(c);

  // Enrich with VulnCheck real-world exploitation intel (initial-access index)
  // when a token is configured and the base lookup succeeded.
  const token = c.env.VULNCHECK_API_TOKEN;
  const id = c.req.query('id');
  if (res.status === 200 && token && id) {
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
      const vc = await vulncheckCve(token, id, AbortSignal.timeout(6000));
      if (vc) data.vulncheck = vc;
      return c.json(data, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
    } catch {
      // VulnCheck enrichment failed — return the un-enriched data we already parsed
      if (data) return c.json(data, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
    }
  }
  return res;
}
