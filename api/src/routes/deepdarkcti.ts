import type { Context } from 'hono';
import type { Env } from '../env';
import { DDC_FILES, parseDDCFile, type DDCEntry, type DDCFileConfig } from '../lib/deepdarkcti-parser';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/** Exported so /api/v1/feed-status can read the same cached payload directly. */
export const DEEPDARKCTI_CACHE_KEY = 'https://deepdarkcti-cache.internal/v1';
const CACHE_KEY = DEEPDARKCTI_CACHE_KEY;
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const DEGRADED_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 10_000;
const LASTGOOD_TTL_SECONDS = 48 * 60 * 60;
const RAW_BASE = 'https://raw.githubusercontent.com/fastfire/deepdarkCTI/main';

interface DDCFileResult {
  source_file: string;
  ok: boolean;
  count: number;
  total_seen: number;
  stale?: boolean;
}

interface DDCResponse {
  generated_at: string;
  sources: DDCFileResult[];
  categories: Array<{ id: string; label: string; count: number }>;
  total: number;
  entries: DDCEntry[];
}

interface LastGoodSlice {
  entries: DDCEntry[];
  refreshed_at: string;
}

function lastGoodKey(file: string): string {
  return `ddc/${file}-lastgood/v1`;
}

async function fetchFile(cfg: DDCFileConfig): Promise<string | null> {
  try {
    const res = await fetch(`${RAW_BASE}/${cfg.file}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/plain, */*' },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function resolveFile(
  cfg: DDCFileConfig,
  kv: KVNamespace | undefined,
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
): Promise<{ entries: DDCEntry[]; result: DDCFileResult }> {
  const text = await fetchFile(cfg);
  let entries: DDCEntry[] = [];
  const fetchOk = text !== null;
  if (fetchOk) {
    entries = parseDDCFile(text!, cfg);
  }

  if (fetchOk) {
    if (kv) {
      const payload: LastGoodSlice = { entries, refreshed_at: new Date().toISOString() };
      const guarded = async () => {
        if (await shouldWriteLastGood(`ddcti:${cfg.file}`)) {
          await kv.put(lastGoodKey(cfg.file), JSON.stringify(payload), {
            expirationTtl: LASTGOOD_TTL_SECONDS,
          });
        }
      };
      if (executionCtx) executionCtx.waitUntil(guarded());
      else void guarded();
    }
    return {
      entries,
      result: { source_file: cfg.file, ok: true, count: entries.length, total_seen: entries.length },
    };
  }

  // Fetch failed → restore last-good if present.
  if (kv) {
    try {
      const rawLg = await kv.get(lastGoodKey(cfg.file));
      if (rawLg) {
        const lg = JSON.parse(rawLg) as LastGoodSlice;
        if (Array.isArray(lg.entries) && lg.entries.length > 0) {
          return {
            entries: lg.entries,
            result: {
              source_file: cfg.file,
              ok: false,
              count: lg.entries.length,
              total_seen: lg.entries.length,
              stale: true,
            },
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return { entries: [], result: { source_file: cfg.file, ok: false, count: 0, total_seen: 0 } };
}

export async function buildDeepDarkCti(
  kv: KVNamespace | undefined,
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
): Promise<DDCResponse> {
  const resolved = await Promise.all(DDC_FILES.map((c) => resolveFile(c, kv, executionCtx)));
  const entries = resolved.flatMap((r) => r.entries);
  const sources = resolved.map((r) => r.result);

  const catMap = new Map<string, number>();
  for (const e of entries) catMap.set(e.category, (catMap.get(e.category) ?? 0) + 1);
  const categories = DDC_FILES.filter((f) => catMap.has(f.label)).map((f) => ({
    id: f.file.replace(/\.md$/, ''),
    label: f.label,
    count: catMap.get(f.label) ?? 0,
  }));

  entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return {
    generated_at: new Date().toISOString(),
    sources,
    categories,
    total: entries.length,
    entries,
  };
}

function ttlFor(body: DDCResponse): number {
  const anyHardFail = body.sources.some((s) => !s.ok && !s.stale);
  return anyHardFail ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS;
}

export async function deepDarkCtiHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await buildDeepDarkCti(c.env.KV_CACHE, c.executionCtx);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttlFor(body)}`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
