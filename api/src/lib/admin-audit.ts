/**
 * Admin action audit logger.
 *
 * Every admin mutation (cache purge, API key create/revoke, briefing build,
 * case-study approve/reject, etc.) is logged to Analytics Engine with:
 *   - action: what was done (e.g., 'cache_purge', 'api_key_create')
 *   - actor: admin token prefix (first 8 chars) for attribution
 *   - target: what was acted upon (e.g., key ID, cache zone)
 *   - ip: requester IP (for abuse investigation)
 *   - timestamp: ISO 8601
 *
 * Logs are queryable via the Cloudflare Analytics Engine SQL API.
 *
 * Usage:
 *   import { auditAdminAction } from '../lib/admin-audit';
 *   await auditAdminAction(c, 'api_key_create', { label: 'test-key', role: 'readonly' });
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { trackEvent, visitorCountry } from './analytics';

export type AdminAction =
  | 'cache_purge'
  | 'api_key_create'
  | 'api_key_revoke'
  | 'briefing_build'
  | 'briefing_backfill'
  | 'briefing_sweep'
  | 'case_study_approve'
  | 'case_study_reject'
  | 'case_study_publish'
  | 'external_resource_create'
  | 'external_resource_delete'
  | 'telegram_channel_add'
  | 'telegram_channel_delete'
  | 'telegram_webhook_register'
  | 'campaign_save'
  | 'campaign_delete'
  | 'feed_job_create'
  | 'feed_job_run'
  | 'investigation_create'
  | 'investigation_delete'
  | 'intel_bundle_build'
  | 'rag_index'
  | 'automation_run';

/**
 * Log an admin action to Analytics Engine.
 * Fire-and-forget — never blocks the response.
 */
export function auditAdminAction(
  c: Context<{ Bindings: Env }>,
  action: AdminAction,
  meta?: Record<string, string | number>
): void {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const country = visitorCountry(c.req.raw);

  // Extract admin token prefix for attribution (never log the full token).
  const authz = c.req.header('authorization') ?? '';
  const adminToken = c.req.header('x-admin-token') ?? '';
  const tokenSource = /^Bearer\s+(.+)$/i.exec(authz)?.[1] ?? adminToken;
  const tokenPrefix = tokenSource ? tokenSource.slice(0, 8) : 'unknown';

  const metaStr = meta ? JSON.stringify(meta) : '';

  trackEvent(c.env as Pick<Env, 'AJ_analytics'>, 'admin_action', {
    blobs: [action, tokenPrefix, ip, metaStr],
    doubles: [1],
    indexes: [country],
  });
}
