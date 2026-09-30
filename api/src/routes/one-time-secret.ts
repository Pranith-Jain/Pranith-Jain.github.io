import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError } from '../lib/api-error';
import { safeJsonBody } from '../lib/safe-body';

const KV_PREFIX = 'ots:';

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const EXPIRY_OPTIONS = {
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
  '7d': 604800,
} as const;

type ExpiryKey = keyof typeof EXPIRY_OPTIONS;

function isValidExpiry(v: string): v is ExpiryKey {
  return v in EXPIRY_OPTIONS;
}

// Payload ceiling: ciphertext is client-side-encrypted base64 — anything
// beyond ~48KB of secret text is abuse, not usage. Caps anonymous writes into
// the SHARED free-plan KV namespace (1k writes/day across the whole platform:
// phishing-fp, daily briefs, bot state all draw from the same quota).
const MAX_CIPHERTEXT_B64_CHARS = 64_000;

/**
 * Global creates/day cap, counted atomically in the CRON_LOCK_DO (the same
 * op:'incr' protocol the rate limiter's strict buckets use). The per-IP
 * 10/min AI bucket only bounds a single source — a distributed writer can
 * still drain the shared 1k/day KV write quota (and every KV consumer with
 * it). One global DO counter bounds the damage regardless of source IP.
 * Falls back to the uncapped per-IP behavior when the DO is unbound.
 */
const OTS_DAILY_LIMIT = 400;

async function dailyCreateCount(c: Context<{ Bindings: Env }>): Promise<number | null> {
  const ns = (c.env as { CRON_LOCK_DO?: DurableObjectNamespace }).CRON_LOCK_DO;
  if (!ns) return null;
  try {
    const dayBucket = Math.floor(Date.now() / 86_400_000);
    const id = ns.idFromName(`ots:global:${dayBucket}`);
    const res = await ns.get(id).fetch('https://cron-lock.internal/incr', {
      method: 'POST',
      body: JSON.stringify({ op: 'incr', cron: `ots:global:${dayBucket}`, ttlMs: 48 * 3600 * 1000 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count?: number };
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}

export async function createSecretHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = await safeJsonBody<{ ciphertext?: unknown; iv?: unknown; expiresIn?: unknown }>(c, {
    maxBytes: 96 * 1024,
    maxDepth: 4,
  });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  if (typeof body.ciphertext !== 'string' || typeof body.iv !== 'string') {
    return badRequest(c, 'ciphertext (base64) and iv (base64) required');
  }
  if (body.ciphertext.length > MAX_CIPHERTEXT_B64_CHARS || body.ciphertext.length < 8) {
    return badRequest(c, `ciphertext must be between 8 and ${MAX_CIPHERTEXT_B64_CHARS} base64 chars`);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(body.ciphertext) || !/^[A-Za-z0-9+/=]+$/.test(body.iv)) {
    return badRequest(c, 'ciphertext and iv must be base64');
  }

  const expiresIn: number =
    typeof body.expiresIn === 'string' && isValidExpiry(body.expiresIn)
      ? EXPIRY_OPTIONS[body.expiresIn as ExpiryKey]
      : 3600;

  // Global daily cap before touching KV — see OTS_DAILY_LIMIT.
  const created = await dailyCreateCount(c);
  if (created !== null && created > OTS_DAILY_LIMIT) {
    return c.json({ error: 'rate_limited', message: 'secret creation quota reached, try later' }, 429, {
      'retry-after': '3600',
      'cache-control': 'no-store',
    });
  }

  const id = generateId();
  const kv = c.env.KV_CACHE;
  if (!kv) return internalError(c, 'storage unavailable');

  const payload = JSON.stringify({ ciphertext: body.ciphertext, iv: body.iv });
  await kv.put(`${KV_PREFIX}${id}`, payload, { expirationTtl: expiresIn });

  return c.json({ id }, 201);
}

export async function getSecretHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    return badRequest(c, 'invalid secret id');
  }

  const kv = c.env.KV_CACHE;
  if (!kv) return internalError(c, 'storage unavailable');

  const key = `${KV_PREFIX}${id}`;
  const raw = await kv.get(key);
  if (!raw) return notFound(c, 'secret not found or already viewed');

  await kv.delete(key);

  try {
    const { ciphertext, iv } = JSON.parse(raw);
    return c.json({ ciphertext, iv });
  } catch {
    return internalError(c, 'corrupt secret data');
  }
}
