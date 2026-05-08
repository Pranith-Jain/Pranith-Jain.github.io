import type { Context } from 'hono';
import type { Env } from '../env';
import { buildSummary, FEED_SOURCES, type SourceId } from '../lib/ioc-feed-parsers';
import { safeErrorMessage } from '../lib/error';

const TIMEOUT_MS = 15_000;
const VALID_SOURCES = new Set<string>(Object.keys(FEED_SOURCES));

export async function iocFeedSummaryHandler(c: Context<{ Bindings: Env }>) {
  const sourceParam = c.req.query('source');

  if (!sourceParam) {
    return c.json(
      {
        error: 'missing source param',
        valid_sources: Array.from(VALID_SOURCES),
      },
      400
    );
  }

  if (!VALID_SOURCES.has(sourceParam)) {
    return c.json(
      {
        error: `unknown source: ${sourceParam}`,
        valid_sources: Array.from(VALID_SOURCES),
      },
      400
    );
  }

  const sourceId = sourceParam as SourceId;
  const feed = FEED_SOURCES[sourceId];

  try {
    const upstream = await fetch(feed.url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'pranithjain-ioc-feed-aggregator/1.0',
        accept: '*/*',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!upstream.ok) {
      return c.json({ error: `upstream ${upstream.status} from ${feed.url}` }, 502);
    }

    const rawBody = await upstream.text();
    const summary = buildSummary(sourceId, rawBody);

    return c.json(summary, 200, {
      'Cache-Control': `public, max-age=${summary.cache_control_seconds}`,
    });
  } catch (err) {
    return c.json({ error: safeErrorMessage(c.env as unknown as Record<string, unknown>, err) }, 502);
  }
}
