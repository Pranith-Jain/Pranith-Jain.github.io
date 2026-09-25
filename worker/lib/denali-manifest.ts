/**
 * Denali manifest — evidence-led AI security reference + stateless checks.
 *
 * Edge port of the deterministic core of github.com/transilienceai/denali
 * (Apache-2.0): the 9 deterministic correlation/detection rules from
 * src/denali/issues/engine.py + src/denali/detections/engine.py (exact UIDs,
 * thresholds, windows, scope/token lists), the domain taxonomy from
 * src/denali/domain/inventory.py + findings.py, and the architecture ADR
 * knowledge base (docs/architecture/*.md).
 *
 * Edge boundary: collectors, connectors, snapshot evaluators, and anything
 * needing Postgres or provider credentials are reference-only here. The
 * `evaluate*` helpers below cover the self-contained sliding-window rules
 * over caller-supplied activity JSON — pure functions, no I/O.
 *
 * Data source: public/data/denali/ (built by scripts/build-denali-manifest.mjs),
 * read through env.ASSETS — no D1, no KV, no public fetch.
 */

export interface DenaliRule {
  uid: string;
  kind: 'issue' | 'runtime_detection';
  engine: 'issues' | 'detections';
  title: string;
  description: string;
  inputs: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  grouping?: string;
  evidenceSemantics: string;
  source: string;
  engineUrl: string;
  license: string;
}

export interface DenaliRulesData {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  total: number;
  kinds: { issue: number; runtime_detection: number };
  rules: DenaliRule[];
}

export interface DenaliTaxonomy {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { assetKinds: number; coverageStates: number; severities: number; relationshipKinds: number };
  assetKinds: Array<{ id: string; category: string }>;
  coverageStates: Array<{ id: string; meaning: string }>;
  findingSeverities: string[];
  findingStates: string[];
  relationshipCategories: Array<{ id: string; meaning: string }>;
  relationshipKinds: Array<{ id: string; category: string }>;
  evidencePrinciples: string[];
}

export interface DenaliDocSlim {
  slug: string;
  file: string;
  kind: 'adr' | 'guide';
  title: string;
  summary: string;
  sourceUrl: string;
  license: string;
}

export interface DenaliIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  tagline: string;
  edgeNote: string;
  counts: { rules: number; issueRules: number; runtimeRules: number; assetKinds: number; docs: number };
  rules: Array<{ uid: string; kind: string; title: string; description: string }>;
  docs: DenaliDocSlim[];
}

const DATA_PREFIX = '/data/denali';

let cachedIndex: DenaliIndex | null = null;
let cachedIndexAt: number | null = null;
let cachedRules: DenaliRulesData | null = null;
let cachedTaxonomy: DenaliTaxonomy | null = null;
let cachedDocsIndex: { docs: DenaliDocSlim[] } | null = null;
const docCache = new Map<string, string>();
let docHits = 0;
let docMisses = 0;
const DOC_CACHE_MAX = 50;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const res = await assets.fetch(new Request(`https://denali.local${path}`));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function fetchText(assets: Fetcher, path: string): Promise<string | null> {
  const res = await assets.fetch(new Request(`https://denali.local${path}`));
  if (!res.ok) return null;
  return await res.text();
}

export async function loadDenaliIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<DenaliIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<DenaliIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Denali index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-denali-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function loadDenaliRules(assets: Fetcher): Promise<DenaliRulesData> {
  if (cachedRules) return cachedRules;
  const data = await fetchJson<DenaliRulesData>(assets, `${DATA_PREFIX}/rules.json`);
  if (!data) {
    throw new Error(
      `Denali rules not found at ${DATA_PREFIX}/rules.json — run 'node scripts/build-denali-manifest.mjs' first.`
    );
  }
  cachedRules = data;
  return data;
}

export function listDenaliRules(
  data: DenaliRulesData,
  opts: { kind?: string; keyword?: string; limit?: number } = {}
): DenaliRule[] {
  const { kind, keyword, limit = 20 } = opts;
  const needle = keyword?.toLowerCase();
  const out: DenaliRule[] = [];
  for (const r of data.rules) {
    if (kind && r.kind !== kind) continue;
    if (needle && `${r.uid} ${r.title} ${r.description}`.toLowerCase().includes(needle) === false) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export function getDenaliRule(data: DenaliRulesData, uid: string): DenaliRule | null {
  return data.rules.find((r) => r.uid.toLowerCase() === uid.toLowerCase()) ?? null;
}

export async function loadDenaliTaxonomy(assets: Fetcher): Promise<DenaliTaxonomy> {
  if (cachedTaxonomy) return cachedTaxonomy;
  const data = await fetchJson<DenaliTaxonomy>(assets, `${DATA_PREFIX}/taxonomy.json`);
  if (!data) {
    throw new Error(
      `Denali taxonomy not found at ${DATA_PREFIX}/taxonomy.json — run 'node scripts/build-denali-manifest.mjs' first.`
    );
  }
  cachedTaxonomy = data;
  return data;
}

export async function listDenaliDocs(
  assets: Fetcher,
  opts: { kind?: string; keyword?: string } = {}
): Promise<DenaliDocSlim[]> {
  if (!cachedDocsIndex) {
    const data = await fetchJson<{ docs: DenaliDocSlim[] }>(assets, `${DATA_PREFIX}/docs-index.json`);
    if (!data) {
      throw new Error(
        `Denali docs index not found at ${DATA_PREFIX}/docs-index.json — run 'node scripts/build-denali-manifest.mjs' first.`
      );
    }
    cachedDocsIndex = data;
  }
  const needle = opts.keyword?.toLowerCase();
  return cachedDocsIndex.docs.filter((d) => {
    if (opts.kind && d.kind !== opts.kind) return false;
    if (needle && `${d.slug} ${d.title} ${d.summary}`.toLowerCase().includes(needle) === false) return false;
    return true;
  });
}

export async function getDenaliDoc(
  assets: Fetcher,
  slug: string
): Promise<{ meta: DenaliDocSlim; body: string } | null> {
  const key = slug.toLowerCase();
  const cached = docCache.get(key);
  if (cached !== undefined) {
    docHits++;
    docCache.delete(key);
    docCache.set(key, cached);
  } else {
    docMisses++;
    const body = await fetchText(assets, `${DATA_PREFIX}/docs/${encodeURIComponent(key)}.md`);
    if (body === null) return null;
    docCache.set(key, body);
    while (docCache.size > DOC_CACHE_MAX) {
      const oldest = docCache.keys().next();
      if (oldest.done) break;
      docCache.delete(oldest.value);
    }
  }
  const docs = await listDenaliDocs(assets);
  const meta = docs.find((d) => d.slug === key) ?? null;
  if (!meta) return null;
  return { meta, body: docCache.get(key) as string };
}

// ─── Stateless rule checks (pure ports of engine slices) ────────────────
// Operate on minimal caller-supplied activity JSON. Field names mirror the
// upstream DetectionActivity shape (category/outcome/entities/session).

export const DENALI_FAILURE_THRESHOLD = 3;
export const DENALI_FAILURE_WINDOW_HOURS = 24;
export const DENALI_SEQUENCE_WINDOW_MINUTES = 5;

export const DENALI_CONSENT_OPERATIONS = [
  'consent to application',
  'add delegated permission grant',
  'add app role assignment grant',
] as const;

export const DENALI_HIGH_IMPACT_SCOPES = [
  'mail.readwrite',
  'mail.readwrite.shared',
  'files.readwrite.all',
  'sites.fullcontrol.all',
  'directory.readwrite.all',
  'rolemanagement.readwrite.directory',
] as const;

export const DENALI_MUTATING_TOOL_TOKENS = [
  'create',
  'delete',
  'execute',
  'invoke',
  'post',
  'publish',
  'put',
  'send',
  'update',
  'write',
] as const;

export interface DenaliActivity {
  category: string;
  outcome: string;
  occurredAt: string;
  actorUid?: string;
  appId?: string;
  session?: string;
  operation?: string;
  scopes?: string[];
}

export interface DenaliSigninCandidate {
  actorUid: string;
  appId: string;
  failures: number;
  windowStart: string;
  windowEnd: string;
  ruleUid: string;
}

/**
 * Port of evaluate_repeated_failed_ai_signins: group ai_app_sign_in
 * failures by exact (actor, application), densest sliding 24h window,
 * flag groups with >= 3 failures. Activities missing actor/app identity
 * count as incomplete (reported, never silently dropped).
 */
export function evaluateFailedSignins(
  activities: DenaliActivity[],
  opts: { threshold?: number; windowHours?: number } = {}
): { candidates: DenaliSigninCandidate[]; incomplete: number; ruleUid: string } {
  const threshold = opts.threshold ?? DENALI_FAILURE_THRESHOLD;
  const windowMs = (opts.windowHours ?? DENALI_FAILURE_WINDOW_HOURS) * 3600 * 1000;
  const groups = new Map<string, { actorUid: string; appId: string; at: number[] }>();
  let incomplete = 0;
  for (const a of activities) {
    if (a.category !== 'ai_app_sign_in' || a.outcome !== 'failure') continue;
    const actor = (a.actorUid ?? '').toLowerCase();
    const app = a.appId ?? '';
    const at = Date.parse(a.occurredAt);
    if (!actor || !app || Number.isNaN(at)) {
      incomplete++;
      continue;
    }
    const key = `${actor} ${app}`;
    const g = groups.get(key) ?? { actorUid: actor, appId: app, at: [] };
    g.at.push(at);
    groups.set(key, g);
  }
  const candidates: DenaliSigninCandidate[] = [];
  for (const g of groups.values()) {
    g.at.sort((x, y) => x - y);
    let best: number[] = [];
    let left = 0;
    for (let right = 0; right < g.at.length; right++) {
      while (g.at[right]! - g.at[left]! > windowMs) left++;
      const window = g.at.slice(left, right + 1);
      if (window.length > best.length) best = window;
    }
    if (best.length >= threshold) {
      candidates.push({
        actorUid: g.actorUid,
        appId: g.appId,
        failures: best.length,
        windowStart: new Date(best[0]!).toISOString(),
        windowEnd: new Date(best[best.length - 1]!).toISOString(),
        ruleUid: 'DENALI-RUNTIME-ENTRA-FAILURES-001',
      });
    }
  }
  candidates.sort((a, b) => b.failures - a.failures);
  return { candidates, incomplete, ruleUid: 'DENALI-RUNTIME-ENTRA-FAILURES-001' };
}

/** Classify an admin_change activity as a high-impact consent grant (DENALI-RUNTIME-ENTRA-CONSENT-001). */
export function classifyConsent(activity: DenaliActivity): {
  isConsentOp: boolean;
  highImpactScopes: string[];
  isHighImpactConsent: boolean;
} {
  const op = (activity.operation ?? '').toLowerCase();
  const isConsentOp = (DENALI_CONSENT_OPERATIONS as readonly string[]).includes(op);
  const scopes = (activity.scopes ?? []).map((s) => s.toLowerCase());
  const highImpactScopes = [
    ...new Set(scopes.filter((s) => (DENALI_HIGH_IMPACT_SCOPES as readonly string[]).includes(s))),
  ].sort();
  return {
    isConsentOp,
    highImpactScopes,
    isHighImpactConsent: activity.outcome === 'success' && isConsentOp && highImpactScopes.length > 0,
  };
}

/** Mutation-like tool operation test (DENALI-RUNTIME-AWS-UNAPPROVED-TOOL-001 token list). */
export function isMutatingToolOperation(operation: string): boolean {
  const op = (operation ?? '').toLowerCase();
  return (DENALI_MUTATING_TOOL_TOKENS as readonly string[]).some((t) => op.includes(t));
}

export interface DenaliSequenceCandidate {
  session: string;
  retrievalAt: string;
  mutationAt: string;
  gapSeconds: number;
  ruleUid: string;
}

/**
 * Port of evaluate_aws_risky_action_sequence: a retrieval-category activity
 * followed by a mutation-like tool call in the same session within 5 minutes.
 * Retrieval = category `model_retrieval` or operation containing
 * read/get/list/search/query; mutation = isMutatingToolOperation.
 */
export function evaluateRiskySequences(
  activities: DenaliActivity[],
  opts: { windowMinutes?: number } = {}
): { candidates: DenaliSequenceCandidate[]; ruleUid: string } {
  const windowMs = (opts.windowMinutes ?? DENALI_SEQUENCE_WINDOW_MINUTES) * 60 * 1000;
  const bySession = new Map<string, DenaliActivity[]>();
  for (const a of activities) {
    if (!a.session) continue;
    const arr = bySession.get(a.session) ?? [];
    arr.push(a);
    bySession.set(a.session, arr);
  }
  const candidates: DenaliSequenceCandidate[] = [];
  for (const [session, list] of bySession) {
    const timed = list
      .map((a) => ({ a, at: Date.parse(a.occurredAt) }))
      .filter((x) => !Number.isNaN(x.at))
      .sort((x, y) => x.at - y.at);
    const retrievals = timed.filter(
      ({ a }) =>
        a.category === 'model_retrieval' || /read|get|list|search|query/.test((a.operation ?? '').toLowerCase())
    );
    const mutations = timed.filter(
      ({ a }) =>
        a.category === 'tool_invocation' && a.outcome === 'success' && isMutatingToolOperation(a.operation ?? '')
    );
    for (const r of retrievals) {
      const next = mutations.find((m) => m.at >= r.at && m.at - r.at <= windowMs);
      if (next) {
        candidates.push({
          session,
          retrievalAt: new Date(r.at).toISOString(),
          mutationAt: new Date(next.at).toISOString(),
          gapSeconds: Math.round((next.at - r.at) / 1000),
          ruleUid: 'DENALI-RUNTIME-AWS-RISKY-SEQUENCE-001',
        });
        break;
      }
    }
  }
  return { candidates, ruleUid: 'DENALI-RUNTIME-AWS-RISKY-SEQUENCE-001' };
}

export type DenaliCoverage = 'complete' | 'partial' | 'failed' | 'not_supported' | 'unknown';

/**
 * Aggregate coverage states (port of aggregate_issue_evaluation_state,
 * stateless form): all-failed → failed; any failed/partial → partial;
 * any complete → complete; all-not_supported → not_supported; else unknown.
 */
export function aggregateCoverage(states: DenaliCoverage[]): DenaliCoverage {
  if (states.length === 0) return 'unknown';
  const set = new Set(states);
  if (set.size === 1 && set.has('failed')) return 'failed';
  if (set.has('failed') || set.has('partial')) return 'partial';
  if (set.has('complete')) return 'complete';
  if (set.size === 1 && set.has('not_supported')) return 'not_supported';
  return 'unknown';
}

export function denaliCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  rulesLoaded: boolean;
  taxonomyLoaded: boolean;
  docs: number;
  docHits: number;
  docMisses: number;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    rulesLoaded: cachedRules !== null,
    taxonomyLoaded: cachedTaxonomy !== null,
    docs: docCache.size,
    docHits,
    docMisses,
  };
}

export function _resetDenaliCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
  cachedRules = null;
  cachedTaxonomy = null;
  cachedDocsIndex = null;
  docCache.clear();
  docHits = 0;
  docMisses = 0;
}
