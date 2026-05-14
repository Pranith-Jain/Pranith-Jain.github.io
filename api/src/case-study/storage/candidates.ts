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

export async function deleteCandidate(ns: KVNamespace, type: CaseStudyType, stableKey: string): Promise<void> {
  await ns.delete(kv.candidate(type, stableKey));
}
