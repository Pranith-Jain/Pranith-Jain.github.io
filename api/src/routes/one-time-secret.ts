import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError } from '../lib/api-error';
import { safeNullLog } from '../lib/safe-catch';

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

export async function createSecretHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await safeNullLog('ots-parse-body', c.req.json());
  if (!body || typeof body.ciphertext !== 'string' || typeof body.iv !== 'string') {
    return badRequest(c, 'ciphertext (base64) and iv (base64) required');
  }

  const expiresIn: number =
    typeof body.expiresIn === 'string' && isValidExpiry(body.expiresIn)
      ? EXPIRY_OPTIONS[body.expiresIn as ExpiryKey]
      : 3600;

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
