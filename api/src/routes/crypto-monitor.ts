import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, forbidden, tooManyRequests } from '../lib/api-error';
import { addWatch, listWatches, removeWatch, listAlerts } from '../lib/address-watch';
import type { CryptoWatchAddInput } from '../lib/validation-schemas';
import { assertPublicHost } from '../lib/ssrf-guard';

export async function cryptoWatchAddHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const input = (c as Context<{ Bindings: Env }> & { parsed: CryptoWatchAddInput }).parsed;
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'watch store unavailable');
  if (input.webhook_url) {
    let url: URL;
    try {
      url = new URL(input.webhook_url);
    } catch (_catchErr) {
      console.error(
        'cryptoWatchAddHandler failed:',
        _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
      );
      return badRequest(c, 'invalid webhook URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return badRequest(c, 'webhook must be http(s)');
    }
    const host = await assertPublicHost(url.hostname);
    if (!host.ok) return badRequest(c, 'webhook host not allowed');
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
  if (!db) return serviceUnavailable(c, 'watch store unavailable');
  return c.json({ watches: await listWatches(db) }, 200);
}

export async function cryptoWatchRemoveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'watch store unavailable');
  await removeWatch(db, c.req.param('address') ?? '', c.req.param('chain') ?? '');
  return c.json({ ok: true }, 200);
}

export async function cryptoAlertsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'watch store unavailable');
  const address = c.req.query('address') ?? '';
  const chain = c.req.query('chain') ?? '';
  return c.json({ alerts: await listAlerts(db, address, chain) }, 200);
}
