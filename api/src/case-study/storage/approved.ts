import type { KVNamespace } from '@cloudflare/workers-types';
import type { Candidate } from '../types';
import { kv } from '../kv-keys';

export async function approve(ns: KVNamespace, c: Candidate): Promise<void> {
  const approved: Candidate = { ...c, status: 'approved' };
  await ns.put(kv.approved(c.key), JSON.stringify(approved));
}

export async function unapprove(ns: KVNamespace, stableKey: string): Promise<void> {
  await ns.delete(kv.approved(stableKey));
}

export async function getApproved(ns: KVNamespace, stableKey: string): Promise<Candidate | null> {
  return (await ns.get(kv.approved(stableKey), 'json')) as Candidate | null;
}

export async function listApproved(ns: KVNamespace): Promise<Candidate[]> {
  const { keys } = await ns.list({ prefix: kv.approvedPrefix });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>));
  return results.filter((x): x is Candidate => x !== null);
}
