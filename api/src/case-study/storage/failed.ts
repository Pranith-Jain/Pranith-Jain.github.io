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
  const { keys } = await ns.list({ prefix: 'failed:' });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<FailureRecord | null>));
  return results.filter((x): x is FailureRecord => x !== null);
}
