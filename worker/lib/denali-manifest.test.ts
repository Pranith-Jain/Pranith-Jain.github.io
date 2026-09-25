import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDenaliIndex,
  loadDenaliRules,
  listDenaliRules,
  getDenaliRule,
  loadDenaliTaxonomy,
  listDenaliDocs,
  getDenaliDoc,
  evaluateFailedSignins,
  classifyConsent,
  isMutatingToolOperation,
  evaluateRiskySequences,
  aggregateCoverage,
  denaliCacheStats,
  _resetDenaliCacheForTests,
  type DenaliActivity,
} from './denali-manifest';

function mockAssets(files: Record<string, unknown>): Fetcher {
  return {
    fetch: async (_req: Request) => {
      const url = new URL(_req.url);
      const data = files[url.pathname];
      if (data === undefined) return new Response(null, { status: 404 });
      if (typeof data === 'string') return new Response(data, { headers: { 'content-type': 'text/markdown' } });
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
}

const FAKE_RULES = {
  source: 's',
  sourceUrl: 'u',
  license: 'Apache-2.0',
  replicatedAt: '2026-09-25',
  total: 2,
  kinds: { issue: 1, runtime_detection: 1 },
  rules: [
    {
      uid: 'DENALI-RUNTIME-ENTRA-FAILURES-001',
      kind: 'runtime_detection',
      engine: 'detections',
      title: 'Repeated failed AI sign-ins',
      description: 'd',
      inputs: {},
      thresholds: { failureThreshold: 3 },
      evidenceSemantics: 'e',
      source: 's',
      engineUrl: 'u',
      license: 'Apache-2.0',
    },
    {
      uid: 'DENALI-ISSUE-AGENT-WRITE-001',
      kind: 'issue',
      engine: 'issues',
      title: 'Agent write path',
      description: 'd',
      inputs: {},
      thresholds: {},
      evidenceSemantics: 'e',
      source: 's',
      engineUrl: 'u',
      license: 'Apache-2.0',
    },
  ],
};

const FAKE_INDEX = {
  source: 's',
  sourceUrl: 'u',
  license: 'Apache-2.0',
  replicatedAt: '2026-09-25',
  tagline: 't',
  edgeNote: 'e',
  counts: { rules: 2, issueRules: 1, runtimeRules: 1, assetKinds: 16, docs: 1 },
  rules: FAKE_RULES.rules.map((r) => ({ uid: r.uid, kind: r.kind, title: r.title, description: r.description })),
  docs: [
    {
      slug: '0001-standalone-product',
      file: '0001-standalone-product.md',
      kind: 'adr',
      title: 'Standalone product',
      summary: 's',
      sourceUrl: 'u',
      license: 'Apache-2.0',
    },
  ],
};

const FAKE_TAXONOMY = {
  source: 's',
  sourceUrl: 'u',
  license: 'Apache-2.0',
  replicatedAt: '2026-09-25',
  counts: { assetKinds: 16, coverageStates: 5, severities: 7, relationshipKinds: 15 },
  assetKinds: [{ id: 'ai_agent', category: 'ai' }],
  coverageStates: [{ id: 'complete', meaning: 'done' }],
  findingSeverities: ['low'],
  findingStates: ['open'],
  relationshipCategories: [{ id: 'capability', meaning: 'auth' }],
  relationshipKinds: [{ id: 'runs_as', category: 'capability' }],
  evidencePrinciples: ['Visibility over absence.'],
};

beforeEach(() => _resetDenaliCacheForTests());

describe('denali loaders', () => {
  const files = {
    '/data/denali/index.json': FAKE_INDEX,
    '/data/denali/rules.json': FAKE_RULES,
    '/data/denali/taxonomy.json': FAKE_TAXONOMY,
    '/data/denali/docs-index.json': { docs: FAKE_INDEX.docs },
    '/data/denali/docs/0001-standalone-product.md': '# Standalone product\n\nBody.',
  };

  it('loads index, rules, taxonomy, and docs', async () => {
    const assets = mockAssets(files);
    expect((await loadDenaliIndex(assets)).counts.rules).toBe(2);
    const rules = await loadDenaliRules(assets);
    expect(listDenaliRules(rules, { kind: 'issue' }).map((r) => r.uid)).toEqual(['DENALI-ISSUE-AGENT-WRITE-001']);
    expect(getDenaliRule(rules, 'denali-runtime-entra-failures-001')?.title).toBe('Repeated failed AI sign-ins');
    expect(getDenaliRule(rules, 'NOPE')).toBeNull();
    expect((await loadDenaliTaxonomy(assets)).counts.assetKinds).toBe(16);
    expect(await listDenaliDocs(assets, { kind: 'adr' })).toHaveLength(1);
    expect(await listDenaliDocs(assets, { keyword: 'standalone' })).toHaveLength(1);
    const doc = await getDenaliDoc(assets, '0001-standalone-product');
    expect(doc?.body).toContain('# Standalone product');
    await getDenaliDoc(assets, '0001-standalone-product');
    expect(denaliCacheStats().docHits).toBe(1);
    expect(await getDenaliDoc(assets, 'missing')).toBeNull();
  });

  it('throws helpful errors when data is missing', async () => {
    await expect(loadDenaliIndex(mockAssets({}))).rejects.toThrow('build-denali-manifest');
    await expect(loadDenaliRules(mockAssets({}))).rejects.toThrow('build-denali-manifest');
  });
});

describe('denali failed-signin check (port of evaluate_repeated_failed_ai_signins)', () => {
  const base: DenaliActivity = {
    category: 'ai_app_sign_in',
    outcome: 'failure',
    occurredAt: '2026-09-20T10:00:00Z',
    actorUid: 'alice',
    appId: 'app-1',
  };

  it('flags 3 failures in 24h for the same actor+app', () => {
    const acts = [0, 5, 12].map((h) => ({
      ...base,
      occurredAt: `2026-09-20T${String(10 + h).padStart(2, '0')}:00:00Z`,
    }));
    const { candidates, incomplete } = evaluateFailedSignins(acts);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.failures).toBe(3);
    expect(candidates[0]!.ruleUid).toBe('DENALI-RUNTIME-ENTRA-FAILURES-001');
    expect(incomplete).toBe(0);
  });

  it('stays silent below threshold, across windows, and across identities', () => {
    const two = [0, 5].map((h) => ({ ...base, occurredAt: `2026-09-20T${10 + h}:00:00:00Z` }));
    expect(evaluateFailedSignins(two).candidates).toEqual([]);
    const spread = [0, 25, 50].map((h) => ({
      ...base,
      occurredAt: new Date(Date.parse('2026-09-20T10:00:00Z') + h * 3600 * 1000).toISOString(),
    }));
    expect(evaluateFailedSignins(spread).candidates).toEqual([]);
    const otherApp = [...two, { ...base, occurredAt: '2026-09-20T12:00:00Z', appId: 'app-2' }];
    expect(evaluateFailedSignins(otherApp).candidates).toEqual([]);
  });

  it('ignores non-failure outcomes and counts identity gaps as incomplete', () => {
    const acts: DenaliActivity[] = [
      { ...base, outcome: 'success' },
      { ...base, actorUid: '' },
      { category: 'model_invocation', outcome: 'failure', occurredAt: base.occurredAt, actorUid: 'a', appId: 'b' },
    ];
    const { candidates, incomplete } = evaluateFailedSignins(acts);
    expect(candidates).toEqual([]);
    expect(incomplete).toBe(1);
  });
});

describe('denali consent + tool checks', () => {
  it('classifies high-impact consent grants', () => {
    const hit = classifyConsent({
      category: 'admin_change',
      outcome: 'success',
      occurredAt: '2026-09-20T10:00:00Z',
      operation: 'Consent to application',
      scopes: ['Mail.ReadWrite', 'User.Read'],
    });
    expect(hit.isConsentOp).toBe(true);
    expect(hit.highImpactScopes).toEqual(['mail.readwrite']);
    expect(hit.isHighImpactConsent).toBe(true);
    const miss = classifyConsent({
      category: 'admin_change',
      outcome: 'success',
      occurredAt: '2026-09-20T10:00:00Z',
      operation: 'Consent to application',
      scopes: ['User.Read'],
    });
    expect(miss.isHighImpactConsent).toBe(false);
  });

  it('detects mutating tool tokens', () => {
    expect(isMutatingToolOperation('s3:PutObject')).toBe(true);
    expect(isMutatingToolOperation('bedrock:InvokeModel')).toBe(true);
    expect(isMutatingToolOperation('logs:DescribeLogGroups')).toBe(false);
  });

  it('flags retrieval-then-mutation sequences in one session', () => {
    const acts: DenaliActivity[] = [
      {
        category: 'model_retrieval',
        outcome: 'success',
        occurredAt: '2026-09-20T10:00:00Z',
        session: 's1',
        operation: 'search-docs',
      },
      {
        category: 'tool_invocation',
        outcome: 'success',
        occurredAt: '2026-09-20T10:03:00Z',
        session: 's1',
        operation: 'send-email',
      },
    ];
    const { candidates } = evaluateRiskySequences(acts);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.gapSeconds).toBe(180);
    const far = acts.map((a, i) => ({ ...a, occurredAt: `2026-09-20T10:${i === 0 ? '00' : '30'}:00Z` }));
    expect(evaluateRiskySequences(far).candidates).toEqual([]);
  });
});

describe('denali coverage aggregation', () => {
  it('follows upstream precedence', () => {
    expect(aggregateCoverage([])).toBe('unknown');
    expect(aggregateCoverage(['failed', 'failed'])).toBe('failed');
    expect(aggregateCoverage(['complete', 'failed'])).toBe('partial');
    expect(aggregateCoverage(['complete', 'partial'])).toBe('partial');
    expect(aggregateCoverage(['complete', 'unknown'])).toBe('complete');
    expect(aggregateCoverage(['not_supported'])).toBe('not_supported');
    expect(aggregateCoverage(['unknown'])).toBe('unknown');
  });
});
