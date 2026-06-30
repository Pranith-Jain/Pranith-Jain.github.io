/**
 * Per-API-Key Rate Limiting Middleware
 *
 * Tracks API key usage in D1 and enforces per-key rate limits.
 * Complements the existing per-IP rate limiting by preventing
 * abuse from authenticated clients regardless of IP.
 *
 * Rate limit tiers:
 *   - Free (no key): 100 requests/day (existing per-IP limit)
 *   - Readonly key: 1,000 requests/day
 *   - Admin key: 10,000 requests/day
 *
 * Usage:
 *   import { apiKeyRateLimit } from '../lib/api-key-ratelimit';
 *   app.use('/api/v1/*', apiKeyRateLimit);
 */

import type { Context, Next } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';
import type { AuthUser } from './auth';

// Rate limit tiers per API key role
const RATE_LIMITS: Record<string, { daily: number; perMinute: number }> = {
  readonly: { daily: 1000, perMinute: 30 },
  admin: { daily: 10000, perMinute: 100 },
};

const DEFAULT_LIMIT = { daily: 100, perMinute: 10 };

interface UsageRecord {
  daily_count: number;
  minute_count: number;
  last_request_at: string;
}

/**
 * Extract API key hash from request (for tracking without storing raw keys).
 */
async function extractKeyHash(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const authz = c.req.header('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
  const key = bearer ?? c.req.header('x-api-key') ?? null;
  if (!key) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create usage record for an API key.
 */
async function getUsage(db: D1Database, keyHash: string): Promise<UsageRecord> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMinute = Math.floor(now.getTime() / 60000);

  try {
    const row = await db
      .prepare(
        `SELECT daily_count, minute_count, last_request_at, daily_bucket, minute_bucket
         FROM api_key_usage WHERE key_hash = ?`
      )
      .bind(keyHash)
      .first<{
        daily_count: number;
        minute_count: number;
        last_request_at: string;
        daily_bucket: string;
        minute_bucket: number;
      }>();

    if (!row) {
      return { daily_count: 0, minute_count: 0, last_request_at: now.toISOString() };
    }

    // Reset counters if buckets changed
    const dailyCount = row.daily_bucket === today ? row.daily_count : 0;
    const minuteCount = row.minute_bucket === currentMinute ? row.minute_count : 0;

    return {
      daily_count: dailyCount,
      minute_count: minuteCount,
      last_request_at: row.last_request_at,
    };
  } catch {
    return { daily_count: 0, minute_count: 0, last_request_at: now.toISOString() };
  }
}

/**
 * Increment usage counter.
 */
async function incrementUsage(db: D1Database, keyHash: string, role: string): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMinute = Math.floor(now.getTime() / 60000);

  try {
    await db
      .prepare(
        `INSERT INTO api_key_usage (key_hash, role, daily_count, minute_count, daily_bucket, minute_bucket, last_request_at)
         VALUES (?, ?, 1, 1, ?, ?, ?)
         ON CONFLICT(key_hash) DO UPDATE SET
           daily_count = CASE WHEN daily_bucket = ? THEN daily_count + 1 ELSE 1 END,
           minute_count = CASE WHEN minute_bucket = ? THEN minute_count + 1 ELSE 1 END,
           daily_bucket = ?,
           minute_bucket = ?,
           last_request_at = ?`
      )
      .bind(
        keyHash,
        role,
        today,
        currentMinute,
        now.toISOString(),
        today,
        currentMinute,
        today,
        currentMinute,
        now.toISOString()
      )
      .run();
  } catch {
    // Best-effort — don't block request on counter failure
  }
}

/**
 * Per-API-key rate limiting middleware.
 * Extracts API key, checks usage against tier limits, increments counter.
 */
export async function apiKeyRateLimit(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  // Only apply to API routes
  const url = new URL(c.req.url);
  if (!url.pathname.startsWith('/api/v1/')) return next();

  // Skip health checks and public endpoints
  if (url.pathname === '/api/v1/health' || url.pathname.startsWith('/api/v1/health/')) return next();

  const db = c.env.BRIEFINGS_DB;
  if (!db) return next(); // No DB available — fall through to IP-based limiting

  const keyHash = await extractKeyHash(c);
  if (!keyHash) return next(); // No API key — fall through to IP-based limiting

  // Read role from the auth middleware's context instead of a redundant D1 query.
  const user = (c as unknown as { user?: AuthUser }).user;
  const role = user?.role ?? 'readonly';

  const limits = RATE_LIMITS[role] ?? DEFAULT_LIMIT;
  const usage = await getUsage(db, keyHash);

  // Check daily limit
  if (usage.daily_count >= limits.daily) {
    return c.json(
      {
        error: 'rate_limited',
        message: `Daily API key limit exceeded (${limits.daily}/day)`,
        limit: limits.daily,
        window: 'daily',
        retry_hint: 'Limit resets at midnight UTC',
      },
      429,
      {
        'retry-after': String(Math.ceil((new Date().setUTCHours(24, 0, 0, 0) - Date.now()) / 1000)),
        'x-ratelimit-limit': String(limits.daily),
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(new Date().setUTCHours(24, 0, 0, 0) / 1000)),
        'cache-control': 'no-store',
      }
    );
  }

  // Check per-minute limit
  if (usage.minute_count >= limits.perMinute) {
    return c.json(
      {
        error: 'rate_limited',
        message: `Per-minute API key limit exceeded (${limits.perMinute}/min)`,
        limit: limits.perMinute,
        window: 'minute',
      },
      429,
      {
        'retry-after': '60',
        'x-ratelimit-limit': String(limits.perMinute),
        'x-ratelimit-remaining': '0',
        'cache-control': 'no-store',
      }
    );
  }

  // Add rate limit headers to response
  await next();

  // Increment counter (fire-and-forget)
  c.executionCtx.waitUntil(incrementUsage(db, keyHash, role));

  // Set rate limit headers
  c.res.headers.set('x-ratelimit-limit', String(limits.daily));
  c.res.headers.set('x-ratelimit-remaining', String(Math.max(0, limits.daily - usage.daily_count - 1)));
  c.res.headers.set('x-ratelimit-role', role);
}
