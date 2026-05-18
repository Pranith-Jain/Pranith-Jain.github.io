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
  // Bounded list: an unbounded .list() defaults to 1000 keys and the
  // Promise.all below then issues one KV read PER key. On the free tier
  // (~1k reads/day) a large approval queue would burn the daily budget in
  // a single call. The planner only ever needs the top of the queue; 200
  // is generous headroom for a realistic backlog.
  const { keys } = await ns.list({ prefix: kv.approvedPrefix, limit: 200 });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>));
  return results.filter((x): x is Candidate => x !== null);
}
