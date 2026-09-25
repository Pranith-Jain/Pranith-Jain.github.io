import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCairnIndex,
  listCairnRules,
  getCairnRule,
  getCairnFamily,
  filterCairnFilters,
  cairnConditionMatches,
  scanCairnText,
  cairnCacheStats,
  _resetCairnCacheForTests,
  type CairnIndex,
  type CairnRule,
} from './cairn-manifest';

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

const FAKE_INDEX: CairnIndex = {
  source: 'github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network',
  sourceUrl: 'https://github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network',
  license: 'MIT',
  replicatedAt: '2026-09-25',
  counts: { rules: 2, t1: 1, t2: 0, t3: 1, filters: 1, filtersEnabled: 1, archetypes: 1, families: 1 },
  filterCategories: ['api'],
  rules: [
    {
      name: 'T1-LLM_API_Endpoint',
      tier: 'T1',
      confidence: 88,
      artifactClass: 'llm_api_endpoint',
      description: 'Primitive LLM provider endpoint',
      family: null,
      stringCount: 2,
    },
    {
      name: 'T3-PromptLock_LLM_Lua_Ransomware',
      tier: 'T3',
      confidence: 90,
      artifactClass: 'llm_api_backdoor',
      description: 'PromptLock ransomware',
      family: 'PromptLock',
      stringCount: 2,
    },
  ],
  families: [
    { slug: 'promptlock', name: 'PROMPTLOCK', platform: 'Go', archetype: 'A1', summary: 'LLM-directed ransomware' },
  ],
};

const T1_ENDPOINT: CairnRule = {
  name: 'T1-LLM_API_Endpoint',
  tier: 'T1',
  confidence: 88,
  artifactType: 'api_key_pattern',
  artifactClass: 'llm_api_endpoint',
  description: 'Primitive LLM provider endpoint',
  family: null,
  archetypes: null,
  reference: null,
  strings: [
    { id: '$openai', pattern: 'api.openai.com', nocase: true },
    { id: '$anthropic', pattern: 'api.anthropic.com', nocase: true },
  ],
  condition: 'any of them',
  source: 'cairn',
  sourceUrl: 'https://example.invalid',
  license: 'MIT',
};

const T3_PROMPTLOCK: CairnRule = {
  name: 'T3-PromptLock_LLM_Lua_Ransomware',
  tier: 'T3',
  confidence: 90,
  artifactType: 'orchestration_logic',
  artifactClass: 'llm_api_backdoor',
  description: 'PromptLock ransomware',
  family: 'PromptLock',
  archetypes: 'A1',
  reference: null,
  strings: [
    { id: '$tfl', pattern: 'target_file_list.log', nocase: true },
    { id: '$speck', pattern: 'SPECK 128bit', nocase: true },
    { id: '$ransom_pl', pattern: 'Ransom.PromptLock', nocase: true },
  ],
  condition: '$ransom_pl or ($tfl and $speck)',
  source: 'cairn',
  sourceUrl: 'https://example.invalid',
  license: 'MIT',
};

const T2_MULTI: CairnRule = {
  ...T1_ENDPOINT,
  name: 'T2-Multi_Model_Provider_Cooccurrence',
  tier: 'T2',
  condition: '2 of them',
};

const T1_ORCH: CairnRule = {
  ...T1_ENDPOINT,
  name: 'T1-Orchestration_Terms',
  tier: 'T1',
  strings: [
    { id: '$planner', pattern: 'planner', nocase: true },
    { id: '$agent_loop', pattern: 'agent loop', nocase: true },
    { id: '$fallback_provider', pattern: 'fallback provider', nocase: true },
  ],
  condition: '2 of them',
};

beforeEach(() => _resetCairnCacheForTests());

describe('cairn index loaders', () => {
  it('loads the slim index and lists rules by tier', async () => {
    const assets = mockAssets({ '/data/cairn/index.json': FAKE_INDEX });
    const idx = await loadCairnIndex(assets);
    expect(idx.counts.rules).toBe(2);
    expect(listCairnRules(idx, { tier: 'T3' }).map((r) => r.name)).toEqual(['T3-PromptLock_LLM_Lua_Ransomware']);
    expect(listCairnRules(idx, { keyword: 'endpoint' }).map((r) => r.name)).toEqual(['T1-LLM_API_Endpoint']);
  });

  it('fetches full rule bodies and caches them', async () => {
    const assets = mockAssets({ '/data/cairn/rules/T1-LLM_API_Endpoint.json': T1_ENDPOINT });
    const first = await getCairnRule(assets, 'T1-LLM_API_Endpoint');
    expect(first?.condition).toBe('any of them');
    await getCairnRule(assets, 'T1-LLM_API_Endpoint');
    expect(cairnCacheStats().bodyHits).toBe(1);
    expect(await getCairnRule(assets, 'Nope')).toBeNull();
  });

  it('fetches family bodies', async () => {
    const body = { slug: 'promptlock', name: 'PROMPTLOCK', summary: 'x', body: '# PROMPTLOCK' };
    const assets = mockAssets({ '/data/cairn/families/promptlock.json': body });
    expect((await getCairnFamily(assets, 'PROMPTLOCK'))?.name).toBe('PROMPTLOCK');
  });

  it('throws a helpful error when the index is missing', async () => {
    await expect(loadCairnIndex(mockAssets({}))).rejects.toThrow('build-cairn-manifest');
  });
});

describe('cairn condition evaluation (port of cairn/rules.py)', () => {
  it('supports any of them / N of them', () => {
    expect(cairnConditionMatches('any of them', new Set(['$a']))).toBe(true);
    expect(cairnConditionMatches('any of them', new Set())).toBe(false);
    expect(cairnConditionMatches('2 of them', new Set(['$a', '$b']))).toBe(true);
    expect(cairnConditionMatches('2 of them', new Set(['$a']))).toBe(false);
  });

  it('supports N of ($a, $b) groups and prefix wildcards', () => {
    expect(cairnConditionMatches('2 of ($a, $b, $c)', new Set(['$a', '$c']))).toBe(true);
    expect(cairnConditionMatches('2 of ($ai_*)', new Set(['$ai_decoy_1', '$ai_decoy_2']))).toBe(true);
    expect(cairnConditionMatches('2 of ($ai_*)', new Set(['$ai_decoy_1']))).toBe(false);
  });

  it('supports boolean combinations over identifiers', () => {
    expect(cairnConditionMatches('$ransom_pl or ($tfl and $speck)', new Set(['$tfl', '$speck']))).toBe(true);
    expect(cairnConditionMatches('$ransom_pl or ($tfl and $speck)', new Set(['$tfl']))).toBe(false);
    expect(cairnConditionMatches('not $a and $b', new Set(['$b']))).toBe(true);
  });

  it('fails closed on unsupported syntax', () => {
    expect(cairnConditionMatches('$ai_*', new Set(['$ai_decoy_1']))).toBe(false);
    expect(cairnConditionMatches('for x in them : ( 1=1 )', new Set(['$a']))).toBe(false);
    expect(cairnConditionMatches('', new Set(['$a']))).toBe(false);
  });
});

describe('cairn scan engine', () => {
  const rules = [T1_ENDPOINT, T3_PROMPTLOCK, T2_MULTI, T1_ORCH];

  it('fires T1 on a provider endpoint (case-insensitive)', () => {
    const matches = scanCairnText(rules, 'beacon to API.OPENAI.COM/v1/chat.completions from loader');
    expect(matches.map((m) => m.rule)).toContain('T1-LLM_API_Endpoint');
  });

  it('fires T3 PromptLock on target_file_list.log + SPECK conjunction', () => {
    const matches = scanCairnText(rules, 'writes target_file_list.log then SPECK 128bit ECB routine');
    expect(matches.map((m) => m.rule)).toContain('T3-PromptLock_LLM_Lua_Ransomware');
    const t3 = matches.find((m) => m.rule === 'T3-PromptLock_LLM_Lua_Ransomware')!;
    expect(t3.family).toBe('PromptLock');
    expect(t3.matchedStrings.length).toBeGreaterThanOrEqual(2);
  });

  it('requires both sides of the T3 conjunction', () => {
    const matches = scanCairnText(rules, 'writes target_file_list.log only');
    expect(matches.map((m) => m.rule)).not.toContain('T3-PromptLock_LLM_Lua_Ransomware');
  });

  it('fires T2 multi-provider on two distinct endpoints, not one', () => {
    expect(scanCairnText([T2_MULTI], 'uses api.openai.com').map((m) => m.rule)).toEqual([]);
    expect(scanCairnText([T2_MULTI], 'uses api.openai.com and api.anthropic.com').map((m) => m.rule)).toEqual([
      'T2-Multi_Model_Provider_Cooccurrence',
    ]);
  });

  it('fires T1 orchestration on 2-of-N terms', () => {
    const matches = scanCairnText([T1_ORCH], 'planner with fallback provider rotation');
    expect(matches).toHaveLength(1);
  });

  it('sorts T3 above T1 and stays silent on clean text', () => {
    const matches = scanCairnText(rules, 'target_file_list.log plus SPECK 128bit plus api.openai.com call');
    expect(matches[0]!.tier).toBe('T3');
    expect(scanCairnText(rules, 'benign notepad.exe with no interesting strings')).toEqual([]);
    expect(scanCairnText(rules, '')).toEqual([]);
  });
});

describe('cairn filter helper', () => {
  it('filters by category and enabled flag', () => {
    const data = {
      source: 's',
      sourceUrl: 'u',
      license: 'MIT',
      replicatedAt: '2026-09-25',
      total: 2,
      enabled: 1,
      categories: ['api'],
      filters: [
        {
          name: 'A',
          slug: 'a',
          category: 'api',
          enabled: true,
          defaultLimit: 100,
          minDetections: 5,
          description: '',
          queryText: '',
        },
        {
          name: 'B',
          slug: 'b',
          category: 'hunt',
          enabled: false,
          defaultLimit: 50,
          minDetections: 2,
          description: '',
          queryText: '',
        },
      ],
    };
    expect(filterCairnFilters(data, { enabledOnly: true }).map((f) => f.slug)).toEqual(['a']);
    expect(filterCairnFilters(data, { category: 'hunt' }).map((f) => f.slug)).toEqual(['b']);
  });
});
