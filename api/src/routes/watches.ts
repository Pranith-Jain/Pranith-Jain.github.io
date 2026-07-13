import type { Context } from 'hono';
import type { Env } from '../env';
import { listWatches, saveWatch, deleteWatch, getAlertLog, type Watch } from '../lib/watch-engine';
import { safeJsonBody } from '../lib/safe-body';
import { badRequest, notFound, serviceUnavailable } from '../lib/api-error';
import { assertPublicHost } from '../lib/ssrf-guard';

export async function listWatchesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');
  const watches = await listWatches(kv, c.env.BRIEFINGS_DB);
  return c.json({ watches }, 200, { 'Cache-Control': 'no-store' });
}

export async function createWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const parsed = await safeJsonBody<{ label: string; type: Watch['type']; value: string; webhook: string }>(c, {
    maxBytes: 4 * 1024,
    maxDepth: 4,
  });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.label || !body.type || !body.value || !body.webhook) {
    return badRequest(c, 'label, type, value, and webhook are required');
  }

  if (!['ransomware-group', 'cve-keyword', 'actor', 'ioc'].includes(body.type)) {
    return badRequest(c, 'Invalid type');
  }

  let url: URL;
  try {
    url = new URL(body.webhook);
  } catch (_catchErr) {
    console.error('createWatchHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return badRequest(c, 'Invalid webhook URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return badRequest(c, 'webhook must be http(s)');
  }
  const host = await assertPublicHost(url.hostname);
  if (!host.ok) return badRequest(c, 'webhook host not allowed');

  const watch: Watch = {
    id: crypto.randomUUID(),
    label: body.label,
    type: body.type,
    value: body.value,
    webhook: body.webhook,
    created_at: new Date().toISOString(),
    last_triggered: null,
  };

  await saveWatch(kv, watch, c.env.BRIEFINGS_DB);
  return c.json({ watch }, 201);
}

export async function updateWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const parsed = await safeJsonBody<Partial<Watch>>(c, { maxBytes: 4 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  let watches = await listWatches(kv, c.env.BRIEFINGS_DB);
  const idx = watches.findIndex((w) => w.id === id);
  if (idx < 0) return notFound(c, 'watch not found');

  const watch = { ...watches[idx] } as Watch;
  if (body.label !== undefined) watch.label = body.label;
  if (body.value !== undefined) watch.value = body.value;
  if (body.webhook !== undefined) {
    let url: URL;
    try {
      url = new URL(body.webhook);
    } catch (_catchErr) {
      console.error('updateWatchHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return badRequest(c, 'Invalid webhook URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return badRequest(c, 'webhook must be http(s)');
    }
    const host = await assertPublicHost(url.hostname);
    if (!host.ok) return badRequest(c, 'webhook host not allowed');
    watch.webhook = body.webhook;
  }
  if (body.type !== undefined) {
    if (!['ransomware-group', 'cve-keyword', 'actor', 'ioc'].includes(body.type)) {
      return badRequest(c, 'Invalid type');
    }
    watch.type = body.type;
  }

  watches = watches.map((w) => (w.id === id ? watch : w));
  await saveWatch(kv, watch, c.env.BRIEFINGS_DB);
  return c.json({ watch });
}

export async function deleteWatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  await deleteWatch(kv, id, c.env.BRIEFINGS_DB);
  return c.json({ ok: true });
}

export async function alertLogHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');
  const log = await getAlertLog(kv, c.env.BRIEFINGS_DB);
  return c.json({ alerts: log }, 200, { 'Cache-Control': 'no-store' });
}
