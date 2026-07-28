/**
 * Tests for the Threat Intel typed HTTP client.
 * Run via: npx vitest run src/lib/threat-intel.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTiClient, TiClientError } from './threat-intel';

function makeJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function makeFetchMock(
  handler: (input: string, init?: RequestInit) => Promise<Response> | Response
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as unknown as typeof fetch;
}

describe('createTiClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('index() GETs / and parses JSON', async () => {
    const data = {
      source: 'test',
      license: 'MIT',
      replicatedAt: '2026-07-28',
      lastSyncedAt: '2026-07-28T00:00:00Z',
      counts: { cves: 10, iocs: 5, sectors: 3, kevTotal: 100, lists: 18 },
    };
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/');
      return makeJsonResponse(data);
    });
    const out = await createTiClient({ fetch: fetchMock }).index();
    expect(out.counts.cves).toBe(10);
    expect(out.counts.kevTotal).toBe(100);
  });

  it('listCves() forwards all filter params', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toContain('/api/v1/threat-intel/cves?');
      expect(u).toContain('severity=critical');
      expect(u).toContain('kev_only=true');
      expect(u).toContain('vendor=microsoft');
      expect(u).toContain('days_back=30');
      expect(u).toContain('min_priority=50');
      expect(u).toContain('min_argus_score=40');
      expect(u).toContain('q=rce');
      expect(u).toContain('limit=20');
      return makeJsonResponse({ total: 1, returned: 1, cves: [] });
    });
    await createTiClient({ fetch: fetchMock }).listCves({
      severity: 'critical',
      kevOnly: true,
      vendor: 'microsoft',
      daysBack: 30,
      minPriority: 50,
      minArgusScore: 40,
      keyword: 'rce',
      limit: 20,
    });
  });

  it('listCves() with no options sends no query string', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/cves');
      return makeJsonResponse({ total: 0, returned: 0, cves: [] });
    });
    await createTiClient({ fetch: fetchMock }).listCves();
  });

  it('getCve() URL-encodes the CVE ID', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/cves/CVE-2026-1001');
      return makeJsonResponse({ cveId: 'CVE-2026-1001', cvssV3Score: 9.8 });
    });
    const out = await createTiClient({ fetch: fetchMock }).getCve('CVE-2026-1001');
    expect(out.cveId).toBe('CVE-2026-1001');
  });

  it('listKev() forwards vendor + limit', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toContain('vendor=adobe');
      expect(u).toContain('limit=50');
      return makeJsonResponse({ total: 5, returned: 5, entries: [] });
    });
    await createTiClient({ fetch: fetchMock }).listKev({ vendor: 'adobe', limit: 50 });
  });

  it('listIocs() forwards category + keyword', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toContain('category=ransomware');
      expect(u).toContain('q=lockbit');
      return makeJsonResponse({ total: 1, returned: 1, iocs: [] });
    });
    await createTiClient({ fetch: fetchMock }).listIocs({ category: 'ransomware', keyword: 'lockbit' });
  });

  it('getIoc() URL-encodes the slug', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/iocs/lockbit-4-0-ransomware');
      return makeJsonResponse({ slug: 'lockbit-4-0-ransomware', family: 'LockBit 4.0' });
    });
    const out = await createTiClient({ fetch: fetchMock }).getIoc('lockbit-4-0-ransomware');
    expect(out.family).toBe('LockBit 4.0');
  });

  it('listSectors() GETs /sectors', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/sectors');
      return makeJsonResponse({ sectors: [{ sector: 'financial', title: 'Financial brief' }] });
    });
    const out = await createTiClient({ fetch: fetchMock }).listSectors();
    expect(out.sectors).toHaveLength(1);
  });

  it('getSector() returns the sector body', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/sectors/financial');
      return makeJsonResponse({ sector: 'financial', executiveSummary: 'test' });
    });
    const out = await createTiClient({ fetch: fetchMock }).getSector('financial');
    expect(out.executiveSummary).toBe('test');
  });

  it('listLists() forwards category + keyword + limit', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toContain('category=windows');
      expect(u).toContain('q=pipe');
      expect(u).toContain('limit=10');
      return makeJsonResponse({ total: 1, returned: 1, lists: [] });
    });
    await createTiClient({ fetch: fetchMock }).listLists({ category: 'windows', keyword: 'pipe', limit: 10 });
  });

  it('getList() forwards keyword + severity + limit', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toContain('q=cobalt');
      expect(u).toContain('severity=critical');
      expect(u).toContain('limit=100');
      return makeJsonResponse({
        slug: 'suspicious-named-pipes',
        title: 'Pipes',
        totalEntries: 2,
        returned: 1,
        entries: [],
      });
    });
    await createTiClient({ fetch: fetchMock }).getList('suspicious-named-pipes', {
      keyword: 'cobalt',
      severity: 'critical',
      limit: 100,
    });
  });

  it('stats() returns cache + manifest stats', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/stats');
      return makeJsonResponse({
        counts: { cves: 10, iocs: 5, sectors: 3, kevTotal: 100, lists: 18 },
        source: 'test',
        license: 'MIT',
        replicatedAt: '2026-07-28',
        lastSyncedAt: null,
        cache: {
          indexLoaded: true,
          indexAgeMs: 5000,
          kevLoaded: false,
          kevAgeMs: null,
          cves: { size: 5, hits: 3, misses: 2 },
          iocs: { size: 0, hits: 0, misses: 0 },
          sectors: { size: 0, hits: 0, misses: 0 },
          lists: { size: 0, hits: 0, misses: 0 },
        },
      });
    });
    const out = await createTiClient({ fetch: fetchMock }).stats();
    expect(out.cache.indexLoaded).toBe(true);
    expect(out.cache.cves.hits).toBe(3);
  });

  it('searchOtx() encodes the query', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/search/otx?q=emotet%20malware');
      return makeJsonResponse({ query: 'emotet malware', total: 0, pulses: [] });
    });
    const out = await createTiClient({ fetch: fetchMock }).searchOtx('emotet malware');
    expect(out.total).toBe(0);
  });

  it('searchThreatFox() encodes the query', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/search/threatfox?q=1.2.3.4');
      return makeJsonResponse({ query: '1.2.3.4', total: 1, iocs: [{ ioc_type: 'ip:port', ioc_value: '1.2.3.4:80' }] });
    });
    const out = await createTiClient({ fetch: fetchMock }).searchThreatFox('1.2.3.4');
    expect(out.iocs).toHaveLength(1);
  });

  it('searchMalwareBazaar() encodes the query', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/search/malwarebazaar?q=Emotet');
      return makeJsonResponse({ query: 'Emotet', search_mode: 'tag', total: 0, samples: [] });
    });
    const out = await createTiClient({ fetch: fetchMock }).searchMalwareBazaar('Emotet');
    expect(out.search_mode).toBe('tag');
  });

  it('searchRansomwareLive() encodes the query', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/search/ransomware-live?q=LockBit');
      return makeJsonResponse({ query: 'LockBit', total: 1, groups: [{ name: 'LockBit', victim_count: 100 }] });
    });
    const out = await createTiClient({ fetch: fetchMock }).searchRansomwareLive('LockBit');
    expect(out.groups[0].name).toBe('LockBit');
  });

  it('entityGraph() forwards limit', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/threat-intel/entity-graph?limit=200');
      return makeJsonResponse({
        nodes: [{ id: 'CVE-2026-1001', type: 'cve', label: 'CVE-2026-1001' }],
        edges: [],
        stats: { total_nodes: 1, total_edges: 0, by_type: { cve: 1, actor: 0, sector: 0, technique: 0 } },
        generated_at: '2026-07-28T00:00:00Z',
      });
    });
    const out = await createTiClient({ fetch: fetchMock }).entityGraph(200);
    expect(out.nodes).toHaveLength(1);
  });

  it('HTTP 404 surfaces as TiClientError with status + body', async () => {
    const fetchMock = makeFetchMock(() => makeJsonResponse({ error: 'cve_not_found: CVE-1999-9999' }, { status: 404 }));
    try {
      await createTiClient({ fetch: fetchMock }).getCve('CVE-1999-9999');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TiClientError);
      const err = e as TiClientError;
      expect(err.status).toBe(404);
      expect(err.message).toBe('cve_not_found: CVE-1999-9999');
    }
  });

  it('HTTP 500 surfaces as TiClientError', async () => {
    const fetchMock = makeFetchMock(() => makeJsonResponse({ error: 'ti_stats_failed: boom' }, { status: 500 }));
    await expect(createTiClient({ fetch: fetchMock }).stats()).rejects.toBeInstanceOf(TiClientError);
  });

  it('baseUrl override works', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('http://127.0.0.1:8787/api/v1/threat-intel/');
      return makeJsonResponse({ counts: { cves: 0, iocs: 0, sectors: 0, kevTotal: 0, lists: 0 } });
    });
    await createTiClient({ fetch: fetchMock, baseUrl: 'http://127.0.0.1:8787/api/v1/threat-intel' }).index();
  });
});
