import type { KVNamespace } from '@cloudflare/workers-types';
import type { DedupRecord } from '../types';
import { kv } from '../kv-keys';

const NINETY_DAYS_SECONDS = 90 * 24 * 3600;

export async function touchDedup(
  ns: KVNamespace,
  stableKey: string,
  when: Date,
  publishedSlug?: string
): Promise<void> {
  const record: DedupRecord = {
    lastSeenAt: when.toISOString(),
    ...(publishedSlug ? { publishedSlug } : {}),
  };
  await ns.put(kv.dedup(stableKey), JSON.stringify(record), {
    expirationTtl: NINETY_DAYS_SECONDS,
  });
}

export async function getDedup(ns: KVNamespace, stableKey: string): Promise<DedupRecord | null> {
  return (await ns.get(kv.dedup(stableKey), 'json')) as DedupRecord | null;
}
