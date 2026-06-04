import type { KVNamespace } from '@cloudflare/workers-types';
import type { DedupRecord } from '../types';

/**
 * Dedup/novelty state used to be one KV key per stable-key
 * (`meta:dedup:<key>`). Discovery scores novelty for *every* candidate it
 * evaluates across ~10 runners, so that was ~80-150 KV reads on every daily
 * run — by far the biggest read source against a 1k/day budget.
 *
 * Now the whole set lives in ONE blob (`meta:dedup-index`). Discovery loads
 * it once per run (1 read), scores in memory, and commits all "seen" marks in
 * one write. Legacy per-key entries are seeded into the blob on first access
 * so published-slug continuity (used by the admin slot-sync) isn't lost.
 */

const DEDUP_INDEX_KEY = 'meta:dedup-index';
const LEGACY_PREFIX = 'meta:dedup:';
const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;

export type DedupMap = Record<string, DedupRecord>;

function prune(map: DedupMap, now: Date): DedupMap {
  const cutoff = now.getTime() - NINETY_DAYS_MS;
  const out: DedupMap = {};
  for (const [k, v] of Object.entries(map)) {
    const t = Date.parse(v.lastSeenAt);
    const recent = !Number.isNaN(t) && t >= cutoff;
    // Keep an active suppression even if lastSeenAt is old, so a skipped
    // item stays suppressed for its full window instead of being pruned.
    const suppressActive = v.suppressedUntil ? Date.parse(v.suppressedUntil) > now.getTime() : false;
    if (recent || suppressActive) out[k] = v;
  }
  return out;
}

/** One-time migration: fold legacy `meta:dedup:<key>` entries into the blob. */
async function seedFromLegacy(ns: KVNamespace): Promise<DedupMap> {
  const map: DedupMap = {};
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const res = await ns.list({ prefix: LEGACY_PREFIX, cursor });
    const vals = await Promise.all(res.keys.map((k) => ns.get(k.name, 'json') as Promise<DedupRecord | null>));
    res.keys.forEach((k, i) => {
      const v = vals[i];
      if (v) map[k.name.slice(LEGACY_PREFIX.length)] = v;
    });
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return map;
}

/** Load the whole dedup map with ONE KV read (plus a one-time legacy seed). */
export async function loadDedupMap(ns: KVNamespace): Promise<DedupMap> {
  const raw = (await ns.get(DEDUP_INDEX_KEY, 'json')) as DedupMap | null;
  if (raw) return raw;
  // Blob absent: first run since this change. Seed from legacy keys once,
  // persist as the blob, and never pay the list+N-read cost again.
  const seeded = await seedFromLegacy(ns);
  await ns.put(DEDUP_INDEX_KEY, JSON.stringify(seeded));
  return seeded;
}

export async function saveDedupMap(ns: KVNamespace, map: DedupMap, now: Date = new Date()): Promise<void> {
  await ns.put(DEDUP_INDEX_KEY, JSON.stringify(prune(map, now)));
}

/** Single-key read (publisher + admin; low frequency). */
export async function getDedup(ns: KVNamespace, stableKey: string): Promise<DedupRecord | null> {
  const map = await loadDedupMap(ns);
  return map[stableKey] ?? null;
}

/** Single-key mark (publisher publish, admin publish-now). 1 read + 1 write. */
export async function touchDedup(
  ns: KVNamespace,
  stableKey: string,
  when: Date,
  publishedSlug?: string
): Promise<void> {
  const map = await loadDedupMap(ns);
  const prev = map[stableKey];
  map[stableKey] = {
    lastSeenAt: when.toISOString(),
    ...((publishedSlug ?? prev?.publishedSlug) ? { publishedSlug: publishedSlug ?? prev?.publishedSlug } : {}),
  };
  await saveDedupMap(ns, map, when);
}

/** Batch mark many keys "seen" in ONE read + ONE write (discovery hot path). */
export async function touchDedupMany(ns: KVNamespace, keys: string[], when: Date): Promise<void> {
  if (keys.length === 0) return;
  const map = await loadDedupMap(ns);
  const iso = when.toISOString();
  for (const k of keys) {
    const prev = map[k];
    map[k] = { lastSeenAt: iso, ...(prev?.publishedSlug ? { publishedSlug: prev.publishedSlug } : {}) };
  }
  await saveDedupMap(ns, map, when);
}

/** Pure suppression gate shared by discovery. `republishBlockMs` is the
 *  published-key window (60d). Returns true when the key must NOT be
 *  re-suggested right now. */
export function isKeySuppressed(rec: DedupRecord | null, now: Date, republishBlockMs: number): boolean {
  if (!rec) return false;
  if (rec.suppressedUntil) {
    const s = Date.parse(rec.suppressedUntil);
    if (!Number.isNaN(s) && now.getTime() < s) return true;
  }
  if (!rec.publishedSlug) return false;
  const t = Date.parse(rec.lastSeenAt);
  return !Number.isNaN(t) && now.getTime() - t < republishBlockMs;
}

/** Mark many keys suppressed until `until` in ONE read + ONE write
 *  (admin Skip / Clear-all). Preserves existing lastSeenAt/publishedSlug. */
export async function suppressDedupMany(
  ns: KVNamespace,
  keys: string[],
  until: Date,
  now: Date = new Date()
): Promise<void> {
  if (keys.length === 0) return;
  const map = await loadDedupMap(ns);
  const iso = until.toISOString();
  for (const k of keys) {
    const prev = map[k];
    map[k] = {
      lastSeenAt: prev?.lastSeenAt ?? now.toISOString(),
      ...(prev?.publishedSlug ? { publishedSlug: prev.publishedSlug } : {}),
      suppressedUntil: iso,
    };
  }
  await saveDedupMap(ns, map, now);
}
