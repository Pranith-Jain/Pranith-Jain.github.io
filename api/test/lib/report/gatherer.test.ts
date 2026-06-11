import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherPhase, FETCHERS } from '../../../src/lib/report/gatherer';
import { planSources } from '../../../src/lib/report/source-planner';
import type { GatherContext } from '../../../src/lib/report/gatherer';

const ctx = (): GatherContext => ({
  env: {} as never,
  subject: {
    raw: 'LockBit',
    type: 'ransomware',
    canonical: 'LockBit',
    identifiers: { group: 'LockBit' },
    suggestedTemplate: 'ransomware-group',
  },
  signal: AbortSignal.timeout(5000),
});

describe('gatherPhase', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('runs every fetcher in the phase and returns one SourceResult each', async () => {
    // Stub the cache so cache fetchers resolve to empty (status:empty), still one result each.
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(undefined) } });
    const plan = planSources({ template: 'ransomware-group' }, { maxPhaseSubrequests: 40 });
    const results = await gatherPhase(plan, 0, ctx());
    // phase 0 contains all the cache + rag sources for the template
    expect(results.length).toBe(plan.phases[0]!.length);
    for (const r of results) {
      expect(r).toHaveProperty('id');
      expect(['ok', 'empty', 'error', 'timeout']).toContain(r.status);
      expect(Array.isArray(r.items)).toBe(true);
    }
  });

  it('a missing fetcher id yields an error SourceResult, not a throw', async () => {
    const result = await FETCHERS['__does_not_exist__']?.(
      { ...ctx() },
      {
        id: 'x',
        name: 'X',
        kind: 'live',
        authority: 'F',
        cost: 1,
        phase: 0,
      }
    );
    expect(result).toBeUndefined(); // registry has no such entry
  });
});

describe('malpedia fetcher', () => {
  beforeEach(() => vi.restoreAllMocks());

  const planned = {
    id: 'malpedia',
    name: 'Malpedia',
    kind: 'live' as const,
    authority: 'A' as const,
    cost: 2,
    phase: 1,
  };

  const actorCtx = (type: 'actor' | 'ransomware' | 'generic' | 'ip' = 'actor', canonical = 'APT28'): GatherContext => ({
    env: {} as never,
    subject: { raw: canonical, type, canonical, identifiers: {}, suggestedTemplate: 'threat-actor' },
    signal: AbortSignal.timeout(5000),
  });

  // Route-aware fake fetch; counts calls so we can assert zero-network for skipped subjects.
  function routedFetch(map: Record<string, { body: unknown; status?: number }>) {
    const calls: string[] = [];
    const fn = (async (url: string) => {
      calls.push(String(url));
      const hit = Object.entries(map).find(([frag]) => String(url).includes(frag));
      if (!hit) return new Response('{}', { status: 404 });
      const [, { body, status }] = hit;
      return new Response(JSON.stringify(body), { status: status ?? 200 });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('maps an actor hit (description + aliases + families), skipping empty-description items', async () => {
    const { fn } = routedFetch({
      '/api/get/actor/apt28': {
        body: {
          value: 'APT28',
          description: 'Russian state-sponsored group also known as Fancy Bear.',
          meta: { synonyms: ['Fancy Bear', 'Sofacy'] },
          families: ['win.xagent', 'win.sofacy'],
        },
      },
    });
    vi.stubGlobal('fetch', fn);
    const r = await FETCHERS['malpedia']!(actorCtx('actor', 'APT28'), planned);
    expect(r.status).toBe('ok');
    expect(r.items.some((i) => i.text.includes('Fancy Bear'))).toBe(true);
    expect(r.items.every((i) => i.text.trim().length > 0)).toBe(true);
    expect(r.items.some((i) => i.fields?.kind === 'description')).toBe(true);
  });

  it('falls back to the family endpoint when the actor 404s', async () => {
    const { fn, calls } = routedFetch({
      '/api/get/actor/lockbit': { body: {}, status: 404 },
      '/api/get/family/lockbit': {
        body: {
          family_name: 'win.lockbit',
          common_name: 'LockBit',
          description: 'LockBit ransomware-as-a-service.',
          associated_actors: ['Bitwise Spider'],
          alt_names: ['ABCD'],
        },
      },
    });
    vi.stubGlobal('fetch', fn);
    const r = await FETCHERS['malpedia']!(actorCtx('ransomware', 'LockBit'), planned);
    expect(r.status).toBe('ok');
    expect(calls.some((u) => u.includes('/api/get/actor/lockbit'))).toBe(true);
    expect(calls.some((u) => u.includes('/api/get/family/lockbit'))).toBe(true);
    expect(r.items.some((i) => i.text.includes('LockBit ransomware-as-a-service'))).toBe(true);
  });

  it('returns empty when both endpoints have no usable (non-empty-description) content', async () => {
    const { fn } = routedFetch({
      '/api/get/actor/win.lockbit': { body: {}, status: 404 },
      '/api/get/family/win.lockbit': {
        body: { family_name: 'win.lockbit', common_name: 'LockBit', description: '' },
      },
    });
    vi.stubGlobal('fetch', fn);
    const r = await FETCHERS['malpedia']!(actorCtx('generic', 'win.lockbit'), planned);
    expect(r.status).toBe('empty');
    expect(r.total).toBe(0);
  });

  it('skips non-matching subject types with zero fetches', async () => {
    const { fn, calls } = routedFetch({});
    vi.stubGlobal('fetch', fn);
    const r = await FETCHERS['malpedia']!(actorCtx('ip', '8.8.8.8'), planned);
    expect(r.status).toBe('empty');
    expect(calls.length).toBe(0);
  });
});

const actorKbCtx = (canonical: string): GatherContext => ({
  env: {} as never,
  subject: {
    raw: canonical,
    type: 'actor',
    canonical,
    identifiers: {},
    suggestedTemplate: 'threat-actor',
  },
  signal: AbortSignal.timeout(5000),
});

const actorKbSrc = {
  id: 'actor-kb',
  name: 'Threat Actor KB',
  kind: 'live' as const,
  authority: 'B' as const,
  cost: 1,
  phase: 0,
};

describe('actor-kb fetcher (zero-fetch)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('emits alias + MITRE items for a known actor (canonical match) and never fetches', async () => {
    const noFetch = vi.fn(() => {
      throw new Error('actor-kb must not perform any network fetch');
    });
    vi.stubGlobal('fetch', noFetch);
    const r = await FETCHERS['actor-kb']!(actorKbCtx('LockBit'), actorKbSrc);
    expect(r.status).toBe('ok');
    expect(r.id).toBe('actor-kb');
    expect(noFetch).not.toHaveBeenCalled();
    const texts = r.items.map((i) => i.text);
    // alias item carries the alias list; mitre item carries the G-id
    expect(texts.some((t) => t.includes('LockBit') && /alias/i.test(t))).toBe(true);
    expect(texts.some((t) => t.includes('G0125'))).toBe(true);
    // structured fields are present for the writer to cite
    expect(r.items.every((i) => i.fields && typeof i.fields.kind === 'string')).toBe(true);
  });

  it('matches on an alias (Fancy Bear -> APT28)', async () => {
    const r = await FETCHERS['actor-kb']!(actorKbCtx('Fancy Bear'), actorKbSrc);
    expect(r.status).toBe('ok');
    expect(r.items.some((i) => i.text.includes('APT28'))).toBe(true);
  });

  it('returns empty (never error) for an unknown subject', async () => {
    const r = await FETCHERS['actor-kb']!(actorKbCtx('definitely-not-a-real-actor-xyz'), actorKbSrc);
    expect(r.status).toBe('empty');
    expect(r.total).toBe(0);
  });

  it('caps the emitted actors at 10 (slice(0,10)) for a broad match', async () => {
    // 'apt' substring matches many canonical names; ensure the cap holds.
    const r = await FETCHERS['actor-kb']!(actorKbCtx('apt'), actorKbSrc);
    const matchedActors = new Set(r.items.map((i) => i.fields?.canonical).filter(Boolean));
    expect(matchedActors.size).toBeLessThanOrEqual(10);
  });
});

import type { PlannedSource } from '../../../src/lib/report/types';

const wikiSrc: PlannedSource = {
  id: 'wikipedia',
  name: 'Wikipedia',
  kind: 'live',
  authority: 'D',
  cost: 2,
  phase: 0,
};

const actorCtx = (type: GatherContext['subject']['type'] = 'actor', canonical = 'LockBit'): GatherContext => ({
  env: {} as never,
  subject: { raw: canonical, type, canonical, identifiers: {}, suggestedTemplate: 'threat-actor' },
  signal: AbortSignal.timeout(5000),
});

describe('wikipedia fetcher', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps a REST-v1 summary to one ok item', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'LockBit',
          extract: 'LockBit is a ransomware group.',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/LockBit' } },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await FETCHERS['wikipedia']!(actorCtx(), wikiSrc);
    expect(r.status).toBe('ok');
    expect(r.total).toBe(1);
    expect(r.items[0]!.text).toContain('LockBit is a ransomware group.');
    expect(r.items[0]!.url).toBe('https://en.wikipedia.org/wiki/LockBit');
    // summary hit → no fallback search call
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/page/summary/');
  });

  it('falls back to w/api.php search and HTML-strips snippets when summary 404s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: { search: [{ title: 'Conti (ransomware)', snippet: 'A <span>Russian</span> group' }] },
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const r = await FETCHERS['wikipedia']!(actorCtx('generic', 'Conti'), wikiSrc);
    expect(r.status).toBe('ok');
    expect(r.items[0]!.text).toContain('A Russian group'); // tags stripped
    expect(r.items[0]!.text).not.toContain('<span>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/w/api.php');
  });

  it('guards out ip/domain/hash/cve subjects with zero fetches', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const t of ['ip', 'domain', 'hash', 'cve'] as const) {
      const r = await FETCHERS['wikipedia']!(actorCtx(t, '1.2.3.4'), wikiSrc);
      expect(r.status).toBe('empty');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to empty (never error) when both summary and search fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const r = await FETCHERS['wikipedia']!(actorCtx(), wikiSrc);
    expect(r.status).toBe('empty');
  });
});

describe('shodan-cvedb fetcher', () => {
  beforeEach(() => vi.restoreAllMocks());

  const cveCtx = (): GatherContext => ({
    env: {} as never,
    subject: {
      raw: 'CVE-2024-1709',
      type: 'cve',
      canonical: 'CVE-2024-1709',
      identifiers: { cve: 'CVE-2024-1709' },
      suggestedTemplate: 'cve',
    },
    signal: AbortSignal.timeout(5000),
  });
  const planned = {
    id: 'shodan-cvedb',
    name: 'Shodan CVEDB',
    kind: 'live' as const,
    authority: 'B' as const,
    cost: 2,
    phase: 0,
  };

  it('maps CVEDB fields (ranking_epss=percentile, epss=score, ransomware_campaign string, cvss_v3 preferred) and prefixes items', async () => {
    const body = {
      summary: 'ScreenConnect auth bypass',
      cvss: 9.1,
      cvss_v3: 10.0,
      epss: 0.94567,
      ranking_epss: 0.99812,
      kev: true,
      ransomware_campaign: 'Known',
      propose_action: 'Patch ScreenConnect immediately.',
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await FETCHERS['shodan-cvedb']!(cveCtx(), planned);
    expect(r.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://cvedb.shodan.io/cve/CVE-2024-1709');
    // every emitted item carries the source prefix
    expect(r.items.every((i) => i.text.startsWith('Shodan CVEDB:'))).toBe(true);
    const joined = r.items.map((i) => i.text).join('\n');
    expect(joined).toContain('CVSS 10'); // cvss_v3 preferred over cvss
    expect(joined).toContain('EPSS 0.94567'); // epss is the score
    expect(joined).toContain('99th percentile'); // ranking_epss is the percentile
    expect(joined).toContain('CISA KEV: LISTED');
    expect(joined).toContain('ransomware campaign: Known'); // ransomware_campaign is a STRING
    // structured fields preserved for citation
    const epssItem = r.items.find((i) => (i.fields as Record<string, unknown>).epss !== undefined);
    expect((epssItem!.fields as Record<string, unknown>).kind).toBe('shodan-cvedb');
  });

  it('returns empty on 404, one fetch, never throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await FETCHERS['shodan-cvedb']!(cveCtx(), planned);
    expect(r.status).toBe('empty');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns error on non-ok (non-404)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await FETCHERS['shodan-cvedb']!(cveCtx(), planned);
    expect(r.status).toBe('error');
  });

  it('self-skips a non-cve subject to empty with zero fetches', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ipCtx: GatherContext = {
      env: {} as never,
      subject: { raw: '1.2.3.4', type: 'ip', canonical: '1.2.3.4', identifiers: {}, suggestedTemplate: 'ioc' },
      signal: AbortSignal.timeout(5000),
    };
    const r = await FETCHERS['shodan-cvedb']!(ipCtx, planned);
    expect(r.status).toBe('empty');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
