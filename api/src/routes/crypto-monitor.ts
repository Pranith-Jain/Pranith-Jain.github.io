import type { Context } from 'hono';
import type { Env } from '../env';
import { addWatch, listWatches, removeWatch, listAlerts } from '../lib/address-watch';
import type { CryptoWatchAddInput } from '../lib/validation-schemas';
import { assertPublicHost } from '../lib/ssrf-guard';

export async function cryptoWatchAddHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: CryptoWatchAddInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  if (input.webhook_url) {
    let url: URL;
    try {
      url = new URL(input.webhook_url);
    } catch {
      return c.json({ error: 'invalid webhook URL' }, 400);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return c.json({ error: 'webhook must be http(s)' }, 400);
    }
    const host = await assertPublicHost(url.hostname);
    if (!host.ok) return c.json({ error: 'webhook host not allowed' }, 400);
  }
  await addWatch(db, {
    address: input.address,
    chain: input.chain,
    alert_types: input.alert_types,
    min_amount: input.min_amount ?? null,
    webhook_url: input.webhook_url ?? null,
    label: input.label ?? null,
  });
  return c.json({ ok: true, address: input.address, chain: input.chain }, 201);
}

export async function cryptoWatchListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  return c.json({ watches: await listWatches(db) }, 200);
}

export async function cryptoWatchRemoveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  await removeWatch(db, c.req.param('address') ?? '', c.req.param('chain') ?? '');
  return c.json({ ok: true }, 200);
}

export async function cryptoAlertsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'watch store unavailable' }, 503);
  const address = c.req.query('address') ?? '';
  const chain = c.req.query('chain') ?? '';
  return c.json({ alerts: await listAlerts(db, address, chain) }, 200);
}
