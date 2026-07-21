import type { KVNamespace } from '@cloudflare/workers-types';
import type { FailureRecord } from '../types';

const BLOB_KEY = 'failed:all';

const THIRTY_DAYS_SECONDS = 30 * 24 * 3600;

async function readBlob(ns: KVNamespace): Promise<FailureRecord[]> {
  const blob = (await ns.get(BLOB_KEY, 'json')) as FailureRecord[] | null;
  if (blob) return blob;

  // One-time migration: read old per-key format and promote to blob.
  const { keys } = await ns.list({ prefix: 'failed:', limit: 1000 });
  const oldKeys = keys.filter((k) => k.name !== BLOB_KEY);
  if (oldKeys.length === 0) return [];
  const migrated = (
    await Promise.all(oldKeys.map((k) => ns.get(k.name, 'json') as Promise<FailureRecord | null>))
  ).filter((x): x is FailureRecord => x !== null);
  if (migrated.length > 0) {
    await ns.put(BLOB_KEY, JSON.stringify(migrated), { expirationTtl: THIRTY_DAYS_SECONDS });
    for (const k of oldKeys) ns.delete(k.name).catch((err) => console.error('delete old failure key failed:', err));
  }
  return migrated;
}

async function writeBlob(ns: KVNamespace, list: FailureRecord[]): Promise<void> {
  await ns.put(BLOB_KEY, JSON.stringify(list), { expirationTtl: THIRTY_DAYS_SECONDS });
}

export async function recordFailure(ns: KVNamespace, rec: FailureRecord): Promise<void> {
  const list = await readBlob(ns);
  const idx = list.findIndex((x) => x.slotId === rec.slotId);
  if (idx >= 0) list[idx] = rec;
  else list.push(rec);
  await writeBlob(ns, list);
}

export async function listFailures(ns: KVNamespace): Promise<FailureRecord[]> {
  return readBlob(ns);
}

export async function deleteFailure(ns: KVNamespace, slotId: string): Promise<void> {
  const list = await readBlob(ns);
  await writeBlob(
    ns,
    list.filter((x) => x.slotId !== slotId)
  );
}

export async function clearFailures(ns: KVNamespace): Promise<number> {
  const list = await readBlob(ns);
  await ns.delete(BLOB_KEY);
  return list.length;
}

/** Count failure records — single KV read, no list scan. */
export async function countFailures(ns: KVNamespace): Promise<number> {
  return (await readBlob(ns)).length;
}
