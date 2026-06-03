/**
 * Per-source KV slices for the live-IOC feed fan-out.
 *
 * The queue consumer runs one feed source (see `runFeedSourceById`) and parks
 * its contribution here under `live-iocs:slice:<sourceId>`. A later
 * compose-on-read handler (PR3) reads every slice, flattens them, and applies
 * the freshness filter + per-source recount — replacing the synchronous
 * ~33-source fan-out that `fetchLiveIocs` does on a cache miss today.
 *
 * Slices store the RAW pre-freshness contribution (exactly what the source's
 * run() returned), so the reader stays the single source of truth for the
 * freshness window and the count recompute.
 */
import type { LiveIoc, LiveSource, FeedResult } from '../routes/live-iocs';

/** Queue message: which source the consumer should refresh. */
export interface FeedQueueMessage {
  sourceId: string;
}

export const SLICE_KEY_PREFIX = 'live-iocs:slice:';

/** KV key for a source's slice. */
export function sliceKey(sourceId: string): string {
  return SLICE_KEY_PREFIX + sourceId;
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

/** Persist a source's contribution as its slice (overwrites the prior one). */
export async function writeSlice(kv: KVNamespace, sourceId: string, result: FeedResult): Promise<void> {
  const slice: LiveIocSlice = {
    source_id: sourceId,
    generated_at: new Date().toISOString(),
    items: result.items,
    sources: result.sources,
  };
  await kv.put(sliceKey(sourceId), JSON.stringify(slice), { expirationTtl: SLICE_TTL_SECONDS });
}

/** Read a source's slice, or null if absent / unparseable. */
export async function readSlice(kv: KVNamespace, sourceId: string): Promise<LiveIocSlice | null> {
  const raw = await kv.get(sliceKey(sourceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LiveIocSlice;
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.sources)) return null;
    return parsed;
  } catch {
    return null;
  }
}
