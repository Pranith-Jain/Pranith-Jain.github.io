import type { KVNamespace } from '@cloudflare/workers-types';
import { kv } from '../kv-keys';
import type { MetricsRecord } from '../analytics/analytics';

type MetricsBlob = Record<string, MetricsRecord>;

function blobKey(slug: string, platform: string): string {
  return `${slug}:${platform}`;
}

async function readBlob(ns: KVNamespace): Promise<MetricsBlob> {
  const raw = (await ns.get(kv.socialMetrics, 'json')) as MetricsBlob | null;
  return raw && typeof raw === 'object' ? raw : {};
}

/** All metrics records (for the analytics aggregate) — one KV read. */
export async function getAllMetrics(ns: KVNamespace): Promise<MetricsRecord[]> {
  return Object.values(await readBlob(ns));
}

/** Upsert one record into the single metrics blob (read-modify-write). */
export async function upsertMetric(ns: KVNamespace, record: MetricsRecord): Promise<void> {
  const blob = await readBlob(ns);
  blob[blobKey(record.slug, record.platform)] = record;
  await ns.put(kv.socialMetrics, JSON.stringify(blob));
}

/** Upsert several records with a single read + single write (cron refresh). */
export async function upsertMetrics(ns: KVNamespace, records: MetricsRecord[]): Promise<void> {
  if (records.length === 0) return;
  const blob = await readBlob(ns);
  for (const r of records) blob[blobKey(r.slug, r.platform)] = r;
  await ns.put(kv.socialMetrics, JSON.stringify(blob));
}
