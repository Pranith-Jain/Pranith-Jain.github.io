/**
 * Admin retention sweep + Telegram cleanup endpoints.
 *
 * POST /api/v1/admin/retention/run
 *   Body (optional): { days?: number, dry_run?: boolean }
 *   - days: override the retention window. Defaults to 30.
 *   - dry_run: when true, count rows that WOULD be deleted without issuing
 *     the DELETE. Useful for previewing impact before a destructive sweep.
 *
 * POST /api/v1/admin/retention/telegram-cleanup
 *   Body (optional): { days?: number }
 *   - days: max age for telegram_leak_entries. Defaults to 7.
 *   Deletes rows older than the cutoff from telegram_leak_entries only.
 *
 * Auth: requires X-Admin-Token (same as other admin routes).
 */

import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import { badRequest, internalError } from '../lib/api-error';
import { auditAdminAction } from '../lib/admin-audit';
import { safeNullLog } from '../lib/safe-catch';
import { runRetentionSweep, DEFAULT_RETENTION_DAYS } from '../lib/retention';
import { cleanupLeakEntries } from './telegram-leak-monitor';
import { z } from 'zod';

const schema = z.object({
  days: z.number().int().min(1).max(3650).optional(),
  dry_run: z.boolean().optional(),
});

const tgSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

export async function runRetentionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  let body: { days?: number; dry_run?: boolean } = {};
  if (c.req.method === 'POST') {
    const raw = await safeNullLog('parse-body-admin-retention', c.req.json());
    if (raw) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));
      body = parsed.data;
    }
  }
  const days = body.days ?? DEFAULT_RETENTION_DAYS;
  const dryRun = body.dry_run ?? false;

  try {
    const result = await runRetentionSweep(c.env.BRIEFINGS_DB as D1Database, { days, dry_run: dryRun });
    auditAdminAction(c, 'retention_sweep', {
      days,
      dry_run: dryRun ? 1 : 0,
      total_deleted: result.total_deleted,
      tables_swept: result.tables_swept,
    });
    return c.json(result, 200);
  } catch (e) {
    return internalError(c, e);
  }
}

export async function telegramCleanupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  let body: { days?: number } = {};
  if (c.req.method === 'POST') {
    const raw = await safeNullLog('parse-body-tg-cleanup', c.req.json());
    if (raw) {
      const parsed = tgSchema.safeParse(raw);
      if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));
      body = parsed.data;
    }
  }
  const days = body.days ?? 7;

  try {
    const db = c.env.BRIEFINGS_DB as D1Database;
    const countBefore =
      (await db.prepare('SELECT COUNT(*) as n FROM telegram_leak_entries').first<{ n: number }>())?.n ?? 0;
    const deleted = await cleanupLeakEntries(db, days);
    const countAfter =
      (await db.prepare('SELECT COUNT(*) as n FROM telegram_leak_entries').first<{ n: number }>())?.n ?? 0;

    auditAdminAction(c, 'telegram_cleanup', { days, deleted, count_before: countBefore, count_after: countAfter });

    return c.json({
      ok: true,
      max_age_days: days,
      deleted,
      count_before: countBefore,
      count_after: countAfter,
    });
  } catch (e) {
    return internalError(c, e);
  }
}
