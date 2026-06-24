import type { LinkStatus } from './verify-url';

/**
 * Single-blob KV cache for URL liveness verdicts.
 *
 * Why a single blob (not one KV key per URL): on Cloudflare's free plan every
 * KV read AND write counts toward the 50-subrequest/invocation cap. A per-URL
 * cache would spend one read per URL just to look things up — net-negative for
 * a post that cites a dozen unique sources. Instead we keep the whole cache in
 * ONE blob: exactly one read at the start and one write at the end, regardless
 * of how many URLs are checked (mirrors the IOC fan-out's primeBatch/flushBatch).
 *
 * Verdicts get asymmetric TTLs — a live URL rarely dies suddenly (cache long),
 * a transient 'unchecked' should be retried soon (cache briefly). The cache is
 * advisory: if KV is unavailable we fall straight through to a live probe.
 */

type LinkStatusOnly = LinkStatus;

interface CacheEntry {
  s: LinkStatusOnly;
  exp: number; // epoch ms after which the entry is stale
}

type CacheBlob = Record<string, CacheEntry>;

export interface UrlCacheKV {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface CachedVerifyDeps {
  kv: UrlCacheKV;
  /** Current time in epoch ms (injected so the caller controls the clock). */
  nowMs: number;
  /** The real prober — only the cache-misses are passed to it. */
  verify: (urls: string[]) => Promise<Map<string, LinkStatus>>;
  /** Per-verdict TTLs in SECONDS. Defaults: ok 7d, broken 3d, unchecked 30m. */
  ttl?: { ok?: number; broken?: number; unchecked?: number };
  /** Max entries kept in the blob (oldest-expiring pruned first). Default 2000. */
  cap?: number;
  /** KV key for the cache blob. Default 'urlcache:v1'. */
  cacheKey?: string;
}

const DEFAULT_TTL_S = { ok: 7 * 24 * 3600, broken: 3 * 24 * 3600, unchecked: 30 * 60 };
const DEFAULT_CAP = 2000;
const DEFAULT_KEY = 'urlcache:v1';

/** Normalize a URL for a stable cache key: lowercase host, drop the fragment. */
function cacheKeyFor(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url;
  }
}

async function readBlob(kv: UrlCacheKV, key: string): Promise<CacheBlob> {
  try {
    const v = (await kv.get(key, 'json')) as CacheBlob | null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function prune(blob: CacheBlob, cap: number): CacheBlob {
  const keys = Object.keys(blob);
  if (keys.length <= cap) return blob;
  // Keep the entries with the furthest-out expiry (freshest, longest-lived).
  const kept = keys.sort((a, b) => blob[b]!.exp - blob[a]!.exp).slice(0, cap);
  const out: CacheBlob = {};
  for (const k of kept) out[k] = blob[k]!;
  return out;
}

/**
 * Wrap a prober with a single-blob KV cache. Returns a function with the same
 * shape the reference-verification pipeline expects (`(urls) => Map<url,LinkStatus>`),
 * so it drops straight into `verifyAndPruneReferences({ verify })` /
 * `generatePost({ verifyRefs })`.
 */
export function createBatchedCachedVerify(
  deps: CachedVerifyDeps
): (urls: string[]) => Promise<Map<string, LinkStatus>> {
  const ttl = { ...DEFAULT_TTL_S, ...(deps.ttl ?? {}) };
  const cap = deps.cap ?? DEFAULT_CAP;
  const key = deps.cacheKey ?? DEFAULT_KEY;

  return async (urls: string[]): Promise<Map<string, LinkStatus>> => {
    const out = new Map<string, LinkStatus>();
    if (urls.length === 0) return out;

    const blob = await readBlob(deps.kv, key);

    // Partition into fresh cache hits and misses (deduped by normalized key).
    const misses: string[] = [];
    const missKeyByUrl = new Map<string, string>();
    const seenMissKeys = new Set<string>();
    for (const url of urls) {
      const ck = cacheKeyFor(url);
      const hit = blob[ck];
      if (hit && hit.exp > deps.nowMs) {
        out.set(url, hit.s);
      } else {
        missKeyByUrl.set(url, ck);
        if (!seenMissKeys.has(ck)) {
          seenMissKeys.add(ck);
          misses.push(url);
        }
      }
    }

    if (misses.length === 0) return out;

    // Probe only the misses.
    const probed = await deps.verify(misses);
    // Index probed results by normalized key so duplicate input URLs share a verdict.
    const probedByKey = new Map<string, LinkStatus>();
    for (const [url, status] of probed) probedByKey.set(cacheKeyFor(url), status);

    // Fill outputs + write verdicts into the blob with asymmetric TTLs.
    for (const url of urls) {
      if (out.has(url)) continue;
      const ck = missKeyByUrl.get(url) ?? cacheKeyFor(url);
      const status = probedByKey.get(ck);
      if (status === undefined) continue; // prober dropped it; leave unset
      out.set(url, status);
      const ttlS = status === 'ok' ? ttl.ok : status === 'broken' ? ttl.broken : ttl.unchecked;
      blob[ck] = { s: status, exp: deps.nowMs + ttlS * 1000 };
    }

    // One write of the (pruned) blob. Best-effort: a KV failure must not fail
    // verification — the verdicts are already in `out`.
    try {
      await deps.kv.put(key, JSON.stringify(prune(blob, cap)));
    } catch {
      /* cache write is advisory */
    }
    return out;
  };
}
