/**
 * Curated ransomware operation-type lookup.
 *
 * Ransomlook exposes no operation-model metadata, so re-leak analysis can't
 * say "which kind of operation is involved" without a hand-maintained map.
 * Buckets are deliberately coarse and non-overlapping:
 *
 *   - 'RaaS'          affiliate-driven ransomware-as-a-service
 *   - 'Extortion-only' data-theft / leak extortion, little or no encryption
 *   - 'Unclassified'   not in this map (shown honestly, never hidden)
 *
 * "Double extortion" is intentionally NOT a bucket — it's near-universal
 * among leak-site groups and so carries no discriminating signal.
 *
 * Keys are lowercased Ransomlook group slugs. Keep this list short and
 * high-confidence; an unknown group is far better as 'Unclassified' than
 * mislabelled.
 */

export type OpType = 'RaaS' | 'Extortion-only' | 'Unclassified';

const OPTYPE: Record<string, OpType> = {
  // ── RaaS (affiliate programs) ──────────────────────────────────────────
  lockbit: 'RaaS',
  lockbit3: 'RaaS',
  alphv: 'RaaS',
  blackcat: 'RaaS',
  ransomhub: 'RaaS',
  akira: 'RaaS',
  play: 'RaaS',
  qilin: 'RaaS',
  agenda: 'RaaS',
  medusa: 'RaaS',
  blacksuit: 'RaaS',
  royal: 'RaaS',
  'hunters international': 'RaaS',
  hunters: 'RaaS',
  dragonforce: 'RaaS',
  inc: 'RaaS',
  'inc ransom': 'RaaS',
  lynx: 'RaaS',
  rhysida: 'RaaS',
  cactus: 'RaaS',
  '8base': 'RaaS',
  blackbasta: 'RaaS',
  'black basta': 'RaaS',
  bianlian: 'RaaS',
  eldorado: 'RaaS',
  fog: 'RaaS',
  embargo: 'RaaS',
  trinity: 'RaaS',
  kairos: 'RaaS',
  sarcoma: 'RaaS',
  termite: 'RaaS',
  brain: 'RaaS',
  'brain cipher': 'RaaS',
  apos: 'RaaS',
  helldown: 'RaaS',
  interlock: 'RaaS',
  // ── Extortion-only / data-leak ─────────────────────────────────────────
  clop: 'Extortion-only',
  cl0p: 'Extortion-only',
  karakurt: 'Extortion-only',
  ransomhouse: 'Extortion-only',
  lapsus: 'Extortion-only',
  lapsus$: 'Extortion-only',
  donutleaks: 'Extortion-only',
  snatch: 'Extortion-only',
  'money message': 'Extortion-only',
  bashe: 'Extortion-only',
  'world leaks': 'Extortion-only',
};

/** Operation type for a Ransomlook group slug; 'Unclassified' when unknown. */
export function optypeForGroup(slug: string): OpType {
  return OPTYPE[slug.trim().toLowerCase()] ?? 'Unclassified';
}

export const ALL_OPTYPES: OpType[] = ['RaaS', 'Extortion-only', 'Unclassified'];
