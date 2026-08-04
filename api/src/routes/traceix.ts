import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable } from '../lib/api-error';

const TRACEIX_BASE = 'https://ai.perkinsfund.org';

function isValidSha256(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}

export const traceixRouter = new Hono<{ Bindings: Env }>();

traceixRouter.get('/traceix/lookup', async (c) => {
  const hash = c.req.query('hash');
  if (!hash || !isValidSha256(hash)) {
    return badRequest(c, 'Expected a 64-character hex SHA-256 hash');
  }
  const apiKey = c.env.TRACEIX_API_KEY;
  if (!apiKey) {
    return serviceUnavailable(c, 'TRACEIX_API_KEY not set');
  }
  try {
    const res = await fetch(`${TRACEIX_BASE}/api/v1/traceix/av/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ sha256: hash }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json<{
      success: boolean;
      results?: Array<{ engine: string; engine_type: string; file_hash: string; verdict: string }>;
      request_timestamp?: number;
      error?: { error_message?: string };
    }>();
    if (!res.ok || !body.success) {
      return c.json(
        {
          success: false,
          hash,
          error: body.error?.error_message ?? 'traceix lookup failed',
        },
        502
      );
    }
    return c.json({
      success: true,
      hash,
      requestTimestamp: body.request_timestamp,
      avResults: body.results ?? [],
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json(
      {
        success: false,
        hash,
        error: e instanceof Error ? e.message : String(e),
      },
      502
    );
  }
});
