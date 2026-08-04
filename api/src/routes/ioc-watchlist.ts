import type { Context } from 'hono';
import { badRequest, notFound, serviceUnavailable } from '../lib/api-error';
import {
  addWatch,
  listWatches,
  removeWatch,
  getWatch,
  listAlerts,
  getWatchlistStats,
  type IocType,
  type AlertChannel,
} from '../lib/ioc-watchlist';

/**
 * IOC Watchlist — HTTP handlers.
 *
 * POST   /api/v1/ioc-watchlist              Add a watch
 * GET    /api/v1/ioc-watchlist              List watches
 * GET    /api/v1/ioc-watchlist/stats        Dashboard stats
 * GET    /api/v1/ioc-watchlist/alerts       List alerts
 * GET    /api/v1/ioc-watchlist/:id          Get single watch
 * DELETE /api/v1/ioc-watchlist/:id          Remove watch
 */

const VALID_TYPES = new Set(['ip', 'domain', 'url', 'hash', 'cve', 'email']);
const VALID_CHANNELS = new Set(['webhook', 'none']);
const VALID_TLP = new Set(['WHITE', 'GREEN', 'AMBER', 'RED']);

export async function iocWatchlistCreateHandler(c: Context): Promise<Response> {
  const body = (await c.req.json()) as {
    indicator?: string;
    indicator_type?: string;
    label?: string;
    alert_channel?: string;
    webhook_url?: string;
    min_confidence?: number;
    source_filter?: string[];
    tlp?: string;
    notes?: string;
  };

  if (!body.indicator?.trim()) return badRequest(c, 'indicator required');
  if (!body.indicator_type || !VALID_TYPES.has(body.indicator_type)) {
    return badRequest(c, `indicator_type must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
  if (body.alert_channel && !VALID_CHANNELS.has(body.alert_channel)) {
    return badRequest(c, `alert_channel must be one of: ${[...VALID_CHANNELS].join(', ')}`);
  }
  if (body.tlp && !VALID_TLP.has(body.tlp)) {
    return badRequest(c, `tlp must be one of: ${[...VALID_TLP].join(', ')}`);
  }
  if (body.min_confidence !== undefined && (body.min_confidence < 0 || body.min_confidence > 100)) {
    return badRequest(c, 'min_confidence must be 0-100');
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const entry = await addWatch(db, {
    indicator: body.indicator,
    indicator_type: body.indicator_type as IocType,
    label: body.label,
    alert_channel: body.alert_channel as AlertChannel,
    webhook_url: body.webhook_url,
    min_confidence: body.min_confidence,
    source_filter: body.source_filter,
    tlp: body.tlp,
    notes: body.notes,
  });

  return c.json(entry, 201);
}

export async function iocWatchlistListHandler(c: Context): Promise<Response> {
  const type = c.req.query('type');
  if (type && !VALID_TYPES.has(type)) {
    return badRequest(c, `type must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const watches = await listWatches(db, { type: type as IocType | undefined, limit });
  return c.json({ watches, count: watches.length });
}

export async function iocWatchlistGetHandler(c: Context): Promise<Response> {
  const idParam = c.req.param('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;
  if (isNaN(id)) return badRequest(c, 'invalid id');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const watch = await getWatch(db, id);
  if (!watch) return notFound(c, 'not found');
  return c.json(watch);
}

export async function iocWatchlistDeleteHandler(c: Context): Promise<Response> {
  const idParam = c.req.param('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;
  if (isNaN(id)) return badRequest(c, 'invalid id');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const removed = await removeWatch(db, id);
  if (!removed) return notFound(c, 'not found');
  return c.json({ deleted: true });
}

export async function iocWatchlistAlertsHandler(c: Context): Promise<Response> {
  const watchIdRaw = c.req.query('watch_id');
  const watchId = watchIdRaw ? parseInt(watchIdRaw, 10) : undefined;
  if (watchId !== undefined && isNaN(watchId)) {
    return badRequest(c, 'invalid watch_id');
  }
  const indicator = c.req.query('indicator');
  const since = c.req.query('since');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const alerts = await listAlerts(db, { watchId, indicator, since, limit });
  return c.json({ alerts, count: alerts.length });
}

export async function iocWatchlistStatsHandler(c: Context): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not available');

  const stats = await getWatchlistStats(db);
  return c.json(stats);
}
