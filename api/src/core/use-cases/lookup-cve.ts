import type { CveRecord } from '../entities';
import type { ICveRepository } from '../ports';

export interface LookupCveInput {
  id: string;
  repository: ICveRepository;
}

export type LookupCveOutput = { ok: true; data: CveRecord } | { ok: false; error: string; status: 400 | 404 | 502 };

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;

export async function lookupCve(input: LookupCveInput): Promise<LookupCveOutput> {
  const id = input.id.trim().toUpperCase();
  if (!CVE_RE.test(id)) {
    return { ok: false, error: 'Invalid CVE format. Must match CVE-YYYY-NNNN', status: 400 };
  }
  const result = await input.repository.lookup(id);
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status ?? 404 };
  }
  return { ok: true, data: result.data };
}
