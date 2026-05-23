import type { KVNamespace } from '@cloudflare/workers-types';
import type { FailureRecord } from '../types';
import { kv } from '../kv-keys';

const THIRTY_DAYS_SECONDS = 30 * 24 * 3600;

export async function recordFailure(ns: KVNamespace, rec: FailureRecord): Promise<void> {
  await ns.put(kv.failed(rec.slotId), JSON.stringify(rec), {
    expirationTtl: THIRTY_DAYS_SECONDS,
  });
}

export async function listFailures(ns: KVNamespace): Promise<FailureRecord[]> {
  // Bounded list — unbounded .list() defaults to 1000 keys and the
  // Promise.all below does one KV read per key, which would blow the
  // ~1k/day free-tier read budget in a single admin/dashboard call. The
  // failures view only needs the recent tail; 100 is plenty (records
  // also carry a 30-day TTL).
  const { keys } = await ns.list({ prefix: 'failed:', limit: 100 });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<FailureRecord | null>));
  return results.filter((x): x is FailureRecord => x !== null);
}

export async function deleteFailure(ns: KVNamespace, slotId: string): Promise<void> {
  await ns.delete(kv.failed(slotId));
}

export async function clearFailures(ns: KVNamespace): Promise<number> {
  const { keys } = await ns.list({ prefix: 'failed:', limit: 1000 });
  await Promise.all(keys.map((k) => ns.delete(k.name)));
  return keys.length;
}
