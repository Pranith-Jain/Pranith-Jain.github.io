import type { KVNamespace } from '@cloudflare/workers-types';
import type { Candidate, CaseStudyType } from '../types';
import { kv } from '../kv-keys';

const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

export async function putCandidate(ns: KVNamespace, c: Candidate): Promise<void> {
  await ns.put(kv.candidate(c.type, c.key), JSON.stringify(c), {
    expirationTtl: SEVEN_DAYS_SECONDS,
  });
}

export async function getCandidate(ns: KVNamespace, type: CaseStudyType, stableKey: string): Promise<Candidate | null> {
  const raw = await ns.get(kv.candidate(type, stableKey), 'json');
  return raw as Candidate | null;
}

export async function listCandidates(ns: KVNamespace, type: CaseStudyType): Promise<Candidate[]> {
  const { keys } = await ns.list({ prefix: kv.candidatesPrefix(type) });
  const results = await Promise.all(keys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>));
  return results.filter((x): x is Candidate => x !== null);
}

/**
 * All pending candidates across every type in ONE `KV.list`.
 *
 * Candidate keys are `candidates:<type>:<key>`, so the shared `candidates:`
 * prefix returns the whole set. Callers that previously looped the 12 types
 * (12 list ops) now do 1 list + the same N body gets.
 */
export async function listAllCandidates(ns: KVNamespace): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const res = await ns.list({ prefix: kv.candidatesAllPrefix, cursor });
    const batch = await Promise.all(res.keys.map((k) => ns.get(k.name, 'json') as Promise<Candidate | null>));
    for (const c of batch) if (c) out.push(c);
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return out;
}

export async function deleteCandidate(ns: KVNamespace, type: CaseStudyType, stableKey: string): Promise<void> {
  await ns.delete(kv.candidate(type, stableKey));
}
