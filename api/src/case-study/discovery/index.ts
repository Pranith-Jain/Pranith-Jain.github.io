import type { Candidate } from '../types';

export interface RunDiscoveryDeps {
  runners: {
    cve: () => Promise<Candidate[]>;
    actor: () => Promise<Candidate[]>;
    malware: () => Promise<Candidate[]>;
    ransom: () => Promise<Candidate[]>;
  };
  putCandidate: (c: Candidate) => Promise<void>;
  touchDedup: (key: string, now: Date) => Promise<void>;
  now: Date;
  limit?: number;
}

export async function runDiscovery(deps: RunDiscoveryDeps): Promise<{ total: number; kept: number; ids: string[] }> {
  const limit = deps.limit ?? 5;
  const all: Candidate[] = [];

  for (const [name, runner] of Object.entries(deps.runners)) {
    try {
      const results = await runner();
      all.push(...results);
    } catch (err) {
      console.warn(`runDiscovery: ${name} runner failed`, err);
    }
  }

  all.sort((a, b) => b.score - a.score);
  const kept = all.slice(0, limit);

  for (const c of kept) {
    await deps.putCandidate(c);
    await deps.touchDedup(c.key, deps.now);
  }

  console.log(
    JSON.stringify({
      job: 'discovery',
      total: all.length,
      kept: kept.length,
      ids: kept.map((k) => k.key),
      ts: deps.now.toISOString(),
    })
  );

  return { total: all.length, kept: kept.length, ids: kept.map((c) => c.key) };
}
