/**
 * Per-source slices for the live-IOC feed fan-out.
 *
 * The queue consumer runs one feed source (see `runFeedSourceById`) and parks
 * its contribution here under a per-source Cache API entry. A later
 * compose-on-read handler (PR3) reads every slice, flattens them, and applies
 * the freshness filter + per-source recount — replacing the synchronous
 * ~33-source fan-out that `fetchLiveIocs` does on a cache miss today.
 *
 * Slices store the RAW pre-freshness contribution (exactly what the source's
 * run() returned), so the reader stays the single source of truth for the
 * freshness window and the count recompute.
 *
 * # Why Cache API, not KV
 *
 * The live-IOC cron runs hourly and enqueues all ~34 sources; the queue
 * consumer writes one slice per source per refresh. At 34 sources × 24
 * refreshes that was 816 KV writes/day — ~80% of the Workers free-tier
 * 1,000-writes-per-day quota, leaving no headroom for any other feature.
 *
 * Slices are an ideal Cache API fit: per-colo, ephemeral, no cross-colo
 * coordination needed (each colo's cron + queue consumer warms its own copy
 * within a minute of cold start), and the 6h `cache-control: max-age` outlives
 * the 1h refresh cadence with margin — a transient upstream flake keeps the
 * last-good contribution visible instead of dropping the source. The Cache
 * API is free and unlimited; a write never counts against the KV quota.
 *
 * A cold colo sees `presentSlices = 0` for up to one cron cycle after
 * `enqueueAllFeeds` fires, at which point `composeOrFallback` falls through to
 * the synchronous `fetchLiveIocs` fan-out — the same fallback it uses for
 * true cold start today. The page is never blank.
 */
import type { LiveIoc, LiveSource, FeedResult } from '../routes/live-iocs';

/**
 * Queue message. Two shapes share the one `live-iocs-feeds` queue:
 *  - `sourceId`: a live-iocs registry source → compose-on-read slice.
 *  - `gp`: a global-pulse feed → warmed into `gp:warm:<key>`, one feed per
 *    consumer invocation so each gets its own 50-subrequest budget (the old
 *    single-invocation parallel warmer blew the Free-plan cap and starved the
 *    rest of the hourly cron). The producer staggers `delaySeconds` so each gp
 *    feed lands in its own batch → its own invocation.
 */
export interface FeedQueueMessage {
  sourceId?: string;
  gp?: { key: string; path: string };
  /** CyberPulse source warm message. Each source type gets its own consumer
   *  invocation → its own 50-subrequest budget. The consumer fetches the source
   *  and writes to `cp:warm:<type>` KV key; the cron reads from KV and passes
   *  into runCyberPulseIngestion as prefetched data. */
  cp?: { type: 'x_accounts' | 'x_search' };
}

export const SLICE_KEY_PREFIX = 'live-iocs:slice:';

/** Cache API request key for a source's slice (internal URL — never fetched). */
export function sliceKey(sourceId: string): Request {
  return new Request(`https://live-iocs-slice.internal/v1/${encodeURIComponent(sourceId)}`);
}

/**
 * Slice TTL — how long a source's last-written slice survives if its next
 * refresh fails. 6h outlives an hourly refresh with margin, so a transient
 * upstream flake keeps the last-good contribution in the composed response
 * instead of dropping the source; a persistently-dead source ages out within
 * ~6h rather than lingering indefinitely.
 */
export const SLICE_TTL_SECONDS = 6 * 60 * 60;

export interface LiveIocSlice {
  source_id: string;
  /** ISO 8601 — when this slice was written by the consumer. */
  generated_at: string;
  items: LiveIoc[];
  sources: LiveSource[];
}

/**
 * Persist a source's contribution as its slice in the per-colo Cache API
 * (overwrites the prior entry). Best-effort: a Cache API failure is swallowed
 * so a transient cache outage doesn't wedge the queue consumer's retry loop —
 * the cron will simply rebuild the slice on the next refresh.
 */
export async function writeSlice(sourceId: string, result: FeedResult): Promise<void> {
  const slice: LiveIocSlice = {
    source_id: sourceId,
    generated_at: new Date().toISOString(),
    items: result.items,
    sources: result.sources,
  };
  const cache = getDefaultCache();
  if (!cache) return;
  try {
    await cache.put(
      sliceKey(sourceId),
      new Response(JSON.stringify(slice), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${SLICE_TTL_SECONDS}`,
        },
      })
    );
  } catch {
    /* best-effort — a cache write failure must not break the queue consumer */
  }
}

/**
 * Read a source's slice from the per-colo Cache API, or null if absent /
 * unparseable. Cold-colo misses return null; the caller (`composeLiveIocs`)
 * reports `presentSlices < FEED_SOURCE_IDS.length` so the response flags
 * `extraDegraded` and the read path falls back to the synchronous fan-out.
 */
export async function readSlice(sourceId: string): Promise<LiveIocSlice | null> {
  const cache = getDefaultCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(sliceKey(sourceId));
    if (!hit) return null;
    const parsed = (await hit.json()) as LiveIocSlice | null;
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.sources)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getDefaultCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}
