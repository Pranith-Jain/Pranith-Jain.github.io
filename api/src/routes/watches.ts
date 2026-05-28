import type { Context } from 'hono';
import type { Env } from '../env';
import { listWatches, saveWatch, deleteWatch, getAlertLog, type Watch } from '../lib/watch-engine';
import { safeJsonBody } from '../lib/safe-body';

export async function listWatchesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const watches = await listWatches(kv);
  return c.json({ watches }, 200, { 'Cache-Control': 'no-store' });
}

export async function createWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const parsed = await safeJsonBody<{ label: string; type: Watch['type']; value: string; webhook: string }>(c, {
    maxBytes: 4 * 1024,
    maxDepth: 4,
  });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.label || !body.type || !body.value || !body.webhook) {
    return c.json({ error: 'label, type, value, and webhook are required' }, 400);
  }

  if (!['ransomware-group', 'cve-keyword', 'actor', 'ioc'].includes(body.type)) {
    return c.json({ error: 'Invalid type' }, 400);
  }

  try {
    new URL(body.webhook);
  } catch {
    return c.json({ error: 'Invalid webhook URL' }, 400);
  }

  const watch: Watch = {
    id: crypto.randomUUID(),
    label: body.label,
    type: body.type,
    value: body.value,
    webhook: body.webhook,
    created_at: new Date().toISOString(),
    last_triggered: null,
  };

  await saveWatch(kv, watch);
  return c.json({ watch }, 201);
}

export async function updateWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<Partial<Watch>>(c, { maxBytes: 4 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  let watches = await listWatches(kv);
  const idx = watches.findIndex((w) => w.id === id);
  if (idx < 0) return c.json({ error: 'watch not found' }, 404);

  const watch = { ...watches[idx] } as Watch;
  if (body.label !== undefined) watch.label = body.label;
  if (body.value !== undefined) watch.value = body.value;
  if (body.webhook !== undefined) {
    try { new URL(body.webhook); } catch { return c.json({ error: 'Invalid webhook URL' }, 400); }
    watch.webhook = body.webhook;
  }
  if (body.type !== undefined) {
    if (!['ransomware-group', 'cve-keyword', 'actor', 'ioc'].includes(body.type)) {
      return c.json({ error: 'Invalid type' }, 400);
    }
    watch.type = body.type;
  }

  watches = watches.map((w) => (w.id === id ? watch : w));
  await kv.put('watches:v1', JSON.stringify(watches));
  return c.json({ watch });
}

export async function deleteWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  await deleteWatch(kv, id);
  return c.json({ ok: true });
}

export async function alertLogHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);
  const log = await getAlertLog(kv);
  return c.json({ alerts: log }, 200, { 'Cache-Control': 'no-store' });
}
