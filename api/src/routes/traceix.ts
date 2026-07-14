import { Hono } from 'hono';
import type { Env } from '../env';

const TRACEIX_BASE = 'https://ai.perkinsfund.org';

function isValidSha256(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}

export const traceixRouter = new Hono<{ Bindings: Env }>();

traceixRouter.get('/traceix/lookup', async (c) => {
  const hash = c.req.query('hash');
  if (!hash || !isValidSha256(hash)) {
    return c.json({ error: 'invalid_hash', message: 'Expected a 64-character hex SHA-256 hash' }, 400);
  }
  const apiKey = c.env.TRACEIX_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'not_configured', message: 'TRACEIX_API_KEY not set' }, 503);
  }
  try {
    const res = await fetch(`${TRACEIX_BASE}/api/v1/traceix/av/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ sha256: hash }),
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
