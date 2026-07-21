import type { KVNamespace } from '@cloudflare/workers-types';
import type { Candidate } from '../types';
import { kv } from '../kv-keys';

/** Single KV key storing the full approved list as a JSON array.
 *  Replaces the old per-key `approved:<key>` model to eliminate the
 *  list+get-per-key pattern (1 + N KV reads → 1 read). */
const BLOB_KEY = 'approved:all';

async function readBlob(ns: KVNamespace): Promise<Candidate[]> {
  const blob = (await ns.get(BLOB_KEY, 'json')) as Candidate[] | null;
  if (blob) return blob;

  // One-time migration: read old per-key format and promote to blob.
  const { keys } = await ns.list({ prefix: kv.approvedPrefix, limit: 200 });
  const oldKeys = keys.filter((k) => k.name !== BLOB_KEY);
  if (oldKeys.length === 0) return [];
  const migrated = (await Promise.all(oldKeys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>))).filter(
    (x): x is Candidate => x !== null
  );
  if (migrated.length > 0) {
    await ns.put(BLOB_KEY, JSON.stringify(migrated));
    // Best-effort cleanup of old keys — don't await all deletes.
    for (const k of oldKeys) ns.delete(k.name).catch((err) => console.error('delete old approved key failed:', err));
  }
  return migrated;
}

async function writeBlob(ns: KVNamespace, list: Candidate[]): Promise<void> {
  await ns.put(BLOB_KEY, JSON.stringify(list));
}

export async function approve(ns: KVNamespace, c: Candidate): Promise<void> {
  const list = await readBlob(ns);
  const idx = list.findIndex((x) => x.key === c.key);
  const approved: Candidate = { ...c, status: 'approved' };
  if (idx >= 0) list[idx] = approved;
  else list.push(approved);
  await writeBlob(ns, list);
}

export async function unapprove(ns: KVNamespace, stableKey: string): Promise<void> {
  const list = await readBlob(ns);
  await writeBlob(
    ns,
    list.filter((x) => x.key !== stableKey)
  );
}

export async function getApproved(ns: KVNamespace, stableKey: string): Promise<Candidate | null> {
  const list = await readBlob(ns);
  return list.find((x) => x.key === stableKey) ?? null;
}

export async function listApproved(ns: KVNamespace): Promise<Candidate[]> {
  return readBlob(ns);
}

/** Count approved candidates — single KV read, no list scan. */
export async function countApproved(ns: KVNamespace): Promise<number> {
  return (await readBlob(ns)).length;
}
