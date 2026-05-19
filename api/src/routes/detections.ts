import type { Context } from 'hono';
import type { Env } from '../env';
import { trackEvent, visitorCountry } from '../lib/analytics';
import { evaluateRules, type Detection, type EngineIndicator } from '../lib/detection-engine';
import { DETECTION_RULES_PACK } from '../lib/detection-rules-pack';
import { fetchLiveIocs, LIVE_IOCS_CACHE_KEY, type LiveIoc } from './live-iocs';

/**
 * Detection engine output.
 *
 * Runs the curated rule pack (lib/detection-rules-pack.ts) over the unified
 * live-IOC stream and returns the rules that fired. This is the server side
 * of the detection engine; /dfir/detection-lab is the client playground that
 * runs the same evaluator against an analyst-authored rule.
 *
 * Cheap by construction: it reuses the ALREADY-edge-cached live-IOC snapshot
 * (warmed hourly by the worker cron) and only falls back to a fresh upstream
 * fan-out when that cache is cold. Cached 30 min — same churn profile as the
 * stream it derives from.
 */
export const DETECTIONS_CACHE_KEY = 'https://detections-cache.internal/v1';
const CACHE_TTL_SECONDS = 30 * 60;

export interface DetectionsResponse {
  generated_at: string;
  /** Indicators evaluated this run. */
  source_total: number;
  /** Rules in the active pack. */
  rule_count: number;
  severity_counts: Record<string, number>;
  detections: Detection[];
  warnings: { rule_id: string; message: string }[];
}

function toEngineIndicators(items: LiveIoc[]): EngineIndicator[] {
  // LiveIoc is already structurally an EngineIndicator; map explicitly so a
  // future LiveIoc field addition can't silently leak into the engine input.
  return items.map((it) => ({
    value: it.value,
    kind: it.kind,
    source: it.source,
    reporter: it.reporter,
    context: it.context,
    reference_url: it.reference_url,
    observed_at: it.observed_at,
  }));
}

export async function buildDetections(
  executionCtx: { waitUntil: (p: Promise<unknown>) => void },
  env: Env
): Promise<DetectionsResponse> {
  const cache = (caches as unknown as { default: Cache }).default;

  // Prefer the already-warmed live-IOC snapshot; only pay the upstream
  // fan-out when it is genuinely cold.
  let items: LiveIoc[] = [];
  const cachedStream = await cache.match(new Request(LIVE_IOCS_CACHE_KEY));
  if (cachedStream) {
    try {
      const body = (await cachedStream.json()) as { items?: LiveIoc[] };
      if (Array.isArray(body.items)) items = body.items;
    } catch {
      /* fall through to a fresh fetch */
    }
  }
  if (items.length === 0) {
    const fresh = await fetchLiveIocs(executionCtx, env.KV_CACHE, env);
    items = fresh.items;
  }

  const { detections, warnings } = evaluateRules(DETECTION_RULES_PACK, toEngineIndicators(items));

  const severity_counts: Record<string, number> = {};
  for (const d of detections) {
    severity_counts[d.severity] = (severity_counts[d.severity] ?? 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    source_total: items.length,
    rule_count: DETECTION_RULES_PACK.filter((r) => r.enabled !== false).length,
    severity_counts,
    detections,
    warnings,
  };
}

export async function detectionsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(DETECTIONS_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) {
    trackEvent(c.env, 'detections_fetch', {
      blobs: ['hit'],
      indexes: [visitorCountry(c.req.raw)],
    });
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'x-cache': 'HIT',
      },
    });
  }

  const body = await buildDetections(c.executionCtx, c.env);
  // Short TTL when we evaluated nothing — almost certainly an upstream flake
  // on the live stream; retry soon instead of locking an empty result in.
  const ttl = body.source_total === 0 ? 60 : CACHE_TTL_SECONDS;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttl}`,
      'x-cache': 'MISS',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  trackEvent(c.env, 'detections_fetch', {
    blobs: ['miss'],
    doubles: [body.detections.length, body.source_total],
    indexes: [visitorCountry(c.req.raw)],
  });
  return response;
}
