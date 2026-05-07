import type { Context } from 'hono';
import type { Env } from '../env';
import { parseHeaders, parseAuthResults, extractUrls } from '../lib/email-parse';
import { phishingScore } from '../lib/phishing-score';

const MAX_BODY_BYTES = 64 * 1024;

export async function phishingAnalyzeHandler(c: Context<{ Bindings: Env }>) {
  const text = await c.req.text();
  if (!text || text.trim().length === 0) {
    return c.json({ error: 'empty body' }, 400);
  }
  if (new Blob([text]).size > MAX_BODY_BYTES) {
    return c.json({ error: 'body too large (max 64KB)' }, 413);
  }

  const headers = parseHeaders(text);
  const auth = parseAuthResults(
    typeof headers['authentication-results'] === 'string' ? headers['authentication-results'] : ''
  );
  const urls = extractUrls(text);
  const result = phishingScore({ headers, auth, urls });

  return c.json({
    headers,
    auth,
    urls,
    score: result.score,
    verdict: result.verdict,
    flags: result.flags,
  });
}
