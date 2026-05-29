import type { Context } from 'hono';
import type { Env } from '../env';
import { createCveController } from '../controllers';
import { createKvCveRepository } from '../infrastructure/persistence/kv-cve-repository';

export async function cveSearchHandler(c: Context<{ Bindings: Env }>) {
  const repo = createKvCveRepository(c.env.KV_CACHE);
  const controller = createCveController(repo);
  return controller.search(c);
}
