import { ATTACK_ID_INDEX } from '../../data/attack-id-index';
import { ACTOR_ALIASES } from '../../data/threat-actor-aliases';

/** Drop MITRE technique IDs not present in the canonical ATT&CK index. */
export function validateMitreIds(ids: string[]): { valid: string[]; rejected: string[] } {
  const valid: string[] = [];
  const rejected: string[] = [];
  for (const raw of ids) {
    const id = raw.trim().toUpperCase();
    (id in ATTACK_ID_INDEX ? valid : rejected).push(id);
  }
  return { valid, rejected };
}

/** Keep only actor names that resolve to a known alias/slug/canonical. */
export function validateActorNames(names: string[]): { valid: string[]; rejected: string[] } {
  const valid: string[] = [];
  const rejected: string[] = [];
  for (const name of names) {
    const q = name.trim().toLowerCase();
    const hit = ACTOR_ALIASES.some(
      (a) => a.slug === q || a.canonical.toLowerCase() === q || a.aliases.some((x) => x.toLowerCase() === q)
    );
    (hit ? valid : rejected).push(name);
  }
  return { valid, rejected };
}

export interface Claim {
  sourceId: string;
  claimKey: string;
  value: string;
}

export interface Conflict {
  claim: string;
  positions: string[];
  note: string;
}

/** Group claims by key; any key with >=2 distinct values across sources is a conflict. */
export function detectContradictions(claims: Claim[]): Conflict[] {
  const byKey = new Map<string, Set<string>>();
  for (const c of claims) {
    if (!byKey.has(c.claimKey)) byKey.set(c.claimKey, new Set());
    byKey.get(c.claimKey)!.add(c.value);
  }
  const conflicts: Conflict[] = [];
  for (const [claim, values] of byKey) {
    if (values.size >= 2) conflicts.push({ claim, positions: [...values], note: 'sources disagree' });
  }
  return conflicts;
}
