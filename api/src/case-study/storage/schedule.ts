import type { KVNamespace } from '@cloudflare/workers-types';
import type { Slot } from '../types';
import { kv } from '../kv-keys';

/**
 * The publisher cron calls getSchedule every hour just to check "is anything
 * due", but the planner only rewrites the schedule weekly. That was 24 KV
 * reads/day on a 1k/day budget for a value that barely changes. Mirror the
 * schedule into the (free) Cache API and write through on every mutation, so
 * the hourly read is a cache hit. KV is only touched on a cold cache or after
 * a write — and a cache miss simply falls back to KV (never wrong, just an
 * extra read).
 */
const SCHED_CACHE_KEY = 'https://schedule-cache.internal/v1';
const SCHED_TTL = 21_600; // 6h — comfortably spans the hourly publisher gap

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

async function readCached(): Promise<Slot[] | null> {
  const cache = cacheApi();
  if (!cache) return null;
  try {
    const r = await cache.match(SCHED_CACHE_KEY);
    return r ? ((await r.json()) as Slot[]) : null;
  } catch {
    return null;
  }
}

async function writeCached(slots: Slot[]): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  try {
    await cache.put(
      SCHED_CACHE_KEY,
      new Response(JSON.stringify(slots), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${SCHED_TTL}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

export async function getSchedule(ns: KVNamespace): Promise<Slot[]> {
  const cached = await readCached();
  if (cached) return cached;
  const raw = (await ns.get(kv.scheduleUpcoming, 'json')) as Slot[] | null;
  const slots = raw ?? [];
  await writeCached(slots); // populate so the next hourly check is a cache hit
  return slots;
}

export async function setSchedule(ns: KVNamespace, slots: Slot[]): Promise<void> {
  const sorted = [...slots].sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  await ns.put(kv.scheduleUpcoming, JSON.stringify(sorted));
  await writeCached(sorted); // write-through: cache stays coherent with KV
}

export async function markSlotStatus(
  ns: KVNamespace,
  candidateId: string,
  status: Slot['status'],
  extras: Partial<Slot> = {}
): Promise<void> {
  const current = await getSchedule(ns);
  const updated = current.map((s) => (s.candidateId === candidateId ? { ...s, status, ...extras } : s));
  await setSchedule(ns, updated);
}

export async function removeSlot(ns: KVNamespace, candidateId: string): Promise<void> {
  const current = await getSchedule(ns);
  await setSchedule(
    ns,
    current.filter((s) => s.candidateId !== candidateId)
  );
}

export async function pickDueSlot(ns: KVNamespace, now: Date): Promise<Slot | null> {
  const slots = await getSchedule(ns);
  for (const s of slots) {
    if (s.status === 'pending' && new Date(s.slotAt) <= now) return s;
  }
  return null;
}
