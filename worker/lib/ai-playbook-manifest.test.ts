import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAiPlaybookIndex,
  listAiPlaybookLayers,
  getAiPlaybookLayer,
  filterAiPlaybookRiskIds,
  getAiPlaybookRiskId,
  getAiPlaybookCveRefs,
  riskIdsForLayer,
  aiPlaybookStats,
  aiPlaybookCacheStats,
  resetAiPlaybookCache,
  type AiPlaybookIndex,
} from './ai-playbook-manifest';

function mockAssets(files: Record<string, unknown>): Fetcher {
  return {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const data = files[url.pathname];
      if (data === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
}

const FAKE_INDEX: AiPlaybookIndex = {
  source: 'test',
  sourceUrl: 'https://example.invalid/',
  author: 'Test',
  license: 'none',
  licenseNote: 'structure only',
  replicatedAt: '2026-09-30T00:00:00.000Z',
  scope: 'structure-only',
  structureVerifiedAt: '2026-09-30T00:00:00.000Z',
  counts: { layers: 3, chapters: 5, riskIds: 4, owaspLlm: 2, agenticAsi: 2, cveRefs: 2 },
  layers: [
    { id: 'I', name: 'The model', slug: 'model', chapters: 2, summary: 's', url: 'u', riskIds: ['LLM01'] },
    { id: 'II', name: 'The context window', slug: 'context', chapters: 2, summary: 's', url: 'u', riskIds: ['ASI01'] },
    { id: 'III', name: 'The agent loop', slug: 'loop', chapters: 1, summary: 's', url: 'u', riskIds: [] },
  ],
  riskIds: [
    { id: 'LLM01', name: 'Prompt Injection', scheme: 'owasp-llm', layer: 'I', layerName: 'The model', url: 'u' },
    { id: 'LLM02', name: 'Excessive Agency', scheme: 'owasp-llm', layer: 'I', layerName: 'The model', url: 'u' },
    { id: 'ASI01', name: 'Agent Goal Hijack', scheme: 'agentic-asi', layer: 'II', layerName: 'The context window', url: 'u' },
    { id: 'ASI02', name: 'Tool Misuse', scheme: 'agentic-asi', layer: 'II', layerName: 'The context window', url: 'u' },
  ],
  cveRefs: ['CVE-2026-0001', 'CVE-2026-0002'],
};

const KEV = [{ cveId: 'CVE-2026-0001', vendor: 'Acme', product: 'Widget', name: 'RCE', dateAdded: '2026-09-01', dueDate: '2026-09-20' }];

beforeEach(() => {
  resetAiPlaybookCache();
});

describe('loadAiPlaybookIndex', () => {
  it('loads and caches the index', async () => {
    const a = mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX });
    const first = await loadAiPlaybookIndex(a);
    expect(first.counts.layers).toBe(3);
    // second call must hit the module cache, not the fetcher
    const spy = vi.spyOn(a, 'fetch');
    await loadAiPlaybookIndex(a);
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws a build-guidance error when the manifest is missing', async () => {
    await expect(loadAiPlaybookIndex(mockAssets({}))).rejects.toThrow('build-ai-playbook');
  });

  it('refetches when forceRefresh is set', async () => {
    const a = mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX });
    await loadAiPlaybookIndex(a);
    const spy = vi.spyOn(a, 'fetch');
    await loadAiPlaybookIndex(a, { forceRefresh: true });
    expect(spy).toHaveBeenCalled();
  });
});

describe('layers', () => {
  it('lists layers in order', async () => {
    const a = mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX });
    expect((await listAiPlaybookLayers(a)).map((l) => l.id)).toEqual(['I', 'II', 'III']);
  });

  it('resolves a layer by id or slug, case-insensitively', async () => {
    const a = mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX });
    expect((await getAiPlaybookLayer(a, 'ii'))?.name).toBe('The context window');
    expect((await getAiPlaybookLayer(a, 'CONTEXT'))?.id).toBe('II');
    expect(await getAiPlaybookLayer(a, 'nope')).toBeNull();
  });

  it('riskIdsForLayer returns only that layer', () => {
    expect(riskIdsForLayer(FAKE_INDEX, 'I').map((r) => r.id)).toEqual(['LLM01', 'LLM02']);
    expect(riskIdsForLayer(FAKE_INDEX, 'III')).toEqual([]);
  });
});

describe('risk identifiers', () => {
  const assets = () => mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX });

  it('filters by scheme', async () => {
    expect((await filterAiPlaybookRiskIds(assets(), { scheme: 'owasp-llm' })).length).toBe(2);
    expect((await filterAiPlaybookRiskIds(assets(), { scheme: 'agentic-asi' })).length).toBe(2);
  });

  it('filters by layer', async () => {
    expect((await filterAiPlaybookRiskIds(assets(), { layer: 'ii' })).map((r) => r.id)).toEqual(['ASI01', 'ASI02']);
  });

  it('searches id and name, case-insensitively', async () => {
    expect((await filterAiPlaybookRiskIds(assets(), { q: 'llm01' })).map((r) => r.id)).toEqual(['LLM01']);
    expect((await filterAiPlaybookRiskIds(assets(), { q: 'tool misuse' })).map((r) => r.id)).toEqual(['ASI02']);
  });

  it('ANDs filters and applies limit last', async () => {
    const r = await filterAiPlaybookRiskIds(assets(), { scheme: 'owasp-llm', layer: 'I', limit: 1 });
    expect(r.map((x) => x.id)).toEqual(['LLM01']);
  });

  it('ignores a non-positive limit', async () => {
    expect((await filterAiPlaybookRiskIds(assets(), { limit: 0 })).length).toBe(4);
  });

  it('gets one id, upper-casing the lookup', async () => {
    expect((await getAiPlaybookRiskId(assets(), 'llm01'))?.name).toBe('Prompt Injection');
    expect(await getAiPlaybookRiskId(assets(), 'LLM99')).toBeNull();
  });
});

describe('CVE enrichment', () => {
  it('joins against the local KEV feed and never upstream', async () => {
    const a = mockAssets({
      '/data/ai-playbook/index.json': FAKE_INDEX,
      '/data/threat-intel/cves/kev.json': KEV,
    });
    const refs = await getAiPlaybookCveRefs(a);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ cveId: 'CVE-2026-0001', kev: true, vendor: 'Acme', dueDate: '2026-09-20' });
    expect(refs[1]).toMatchObject({ cveId: 'CVE-2026-0002', kev: false, vendor: null });
  });

  it('degrades to reference-only when the KEV feed is unavailable', async () => {
    const refs = await getAiPlaybookCveRefs(mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX }));
    expect(refs.every((r) => r.kev === false)).toBe(true);
    expect(refs).toHaveLength(2);
  });

  it('does not throw on malformed KEV JSON', async () => {
    const a = mockAssets({
      '/data/ai-playbook/index.json': FAKE_INDEX,
      '/data/threat-intel/cves/kev.json': { nope: true },
    });
    await expect(getAiPlaybookCveRefs(a)).resolves.toHaveLength(2);
  });
});

describe('stats', () => {
  it('counts KEV matches and reports cache state', async () => {
    const a = mockAssets({
      '/data/ai-playbook/index.json': FAKE_INDEX,
      '/data/threat-intel/cves/kev.json': KEV,
    });
    const s = await aiPlaybookStats(a);
    expect(s.kevMatched).toBe(1);
    expect(s.scope).toBe('structure-only');
    expect(s.cached).toBe(true);
  });

  it('exposes a cache stat that flips to loaded', async () => {
    expect(aiPlaybookCacheStats().loaded).toBe(false);
    await loadAiPlaybookIndex(mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX }));
    expect(aiPlaybookCacheStats().loaded).toBe(true);
  });
});

describe('licence discipline (regression guard)', () => {
  it('the shipped manifest records structure-only scope and no-prose licence', async () => {
    // Reads the REAL built data, not a fixture: if someone later starts
    // storing chapter bodies in this manifest, this fails.
    const idx = await loadAiPlaybookIndex(mockAssets({ '/data/ai-playbook/index.json': FAKE_INDEX }));
    expect(idx.scope).toBe('structure-only');

    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const real = readFileSync(join(process.cwd(), 'public', 'data', 'ai-playbook', 'index.json'), 'utf8');
    const parsed = JSON.parse(real) as AiPlaybookIndex;
    expect(parsed.scope).toBe('structure-only');
    expect(parsed.license).toMatch(/no reuse licence/i);
    // A prose body would show up as a long free-text field on any record.
    for (const l of parsed.layers) expect(Object.keys(l).sort()).toEqual(
      ['chapters', 'id', 'name', 'riskIds', 'slug', 'summary', 'url'].sort()
    );
    for (const r of parsed.riskIds) expect(Object.keys(r).sort()).toEqual(
      ['id', 'layer', 'layerName', 'name', 'scheme', 'url'].sort()
    );
  });
});