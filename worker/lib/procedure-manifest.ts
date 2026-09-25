/**
 * Procedure learned-rules manifest — static asset read path.
 *
 * Data: public/data/procedures/rules.json (curated seed; upstream calls
 * these FeedbackPatterns — analyst corrections promoted to guardrails).
 * D1 procedure_rules holds approved overrides; the asset is the default.
 * Pattern mirrors worker/lib/si-manifest.ts (ASSETS + per-isolate memo).
 */

export interface ProcedureRule {
  id: string;
  category: string;
  pattern: string;
  status: 'active' | 'pending' | 'dismissed' | 'promoted_to_denylist' | 'promoted_to_prompt';
}

type AssetsFetcher = { fetch: typeof fetch };

let cached: ProcedureRule[] | null = null;
let pending: Promise<ProcedureRule[]> | null = null;

export async function loadProcedureRules(assets: AssetsFetcher): Promise<ProcedureRule[]> {
  if (cached) return cached;
  if (!pending) {
    pending = (async () => {
      const res = await assets.fetch(new Request('https://procedures.local/data/procedures/rules.json'));
      if (!res.ok) {
        if (res.status === 404) {
          cached = [];
          return cached;
        }
        throw new Error(`procedure rules asset missing (${res.status})`);
      }
      const data = (await res.json()) as unknown;
      const list = Array.isArray(data) ? (data as ProcedureRule[]) : (data as { rules?: ProcedureRule[] }).rules ?? [];
      cached = list.filter((r) => r && typeof r.pattern === 'string');
      return cached;
    })().catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

/** Keep only rules relevant to this report (keyword overlap). Pure. */
export function relevantRules(rules: ProcedureRule[], reportText: string, limit = 6): ProcedureRule[] {
  const hay = reportText.toLowerCase();
  const scored = rules
    .filter((r) => r.status === 'active' || r.status === 'promoted_to_prompt')
    .map((r) => {
      const keys = r.pattern.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      let hits = 0;
      for (const k of keys.slice(0, 20)) if (hay.includes(k)) hits++;
      return { r, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored.slice(0, limit).map((s) => s.r);
}

export function _resetProcedureRulesForTests(): void {
  cached = null;
  pending = null;
}
