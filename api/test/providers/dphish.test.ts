import { describe, it, expect, beforeEach } from 'vitest';
import { dphish } from '../../src/providers/dphish';
import type { ProviderEnv } from '../../src/providers/types';
import type { DphishIndex } from '../../src/lib/threat-intel-manifest';
import { _resetTiCacheForTests } from '../../src/lib/threat-intel-manifest';

/**
 * Stub the ASSETS binding with an in-memory map, mirroring the worker
 * manifest tests — the dphish provider reads the replicated manifest via
 * env.ASSETS (zero network), so no fetch mocking needed.
 */
function makeAssets(index: DphishIndex): Fetcher {
  const data = new Map<string, unknown>([['/data/threat-intel/dphish/index.json', index]]);
  return {
    fetch: async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const path = new URL(url).pathname;
      const body = data.get(path);
      if (body === undefined) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    },
  } as unknown as Fetcher;
}

function buildEnv(index: DphishIndex): ProviderEnv {
  return {
    VT_API_KEY: '',
    ABUSEIPDB_API_KEY: '',
    SHODAN_API_KEY: '',
    CENSYS_PAT: '',
    CENSYS_ORG_ID: '',
    NETLAS_API_KEY: '',
    OTX_API_KEY: '',
    URLSCAN_API_KEY: '',
    HYBRID_ANALYSIS_API_KEY: '',
    ASSETS: makeAssets(index),
  };
}

function makeIndex(overrides: Partial<DphishIndex> = {}): DphishIndex {
  return {
    source: 'dphish.com',
    sourceUrl: 'https://dphish.com/feeds/',
    collectionId: 'test-collection',
    collectionUrl: 'https://tip.dphish.live/taxii2/root/collections/test/objects/',
    description: 'test',
    license: 'Public feed (no registration required)',
    syncedAt: '2026-08-15T08:42:17.195Z',
    counts: { indicators: 3, active: 2, revoked: 1, byCategory: { domain: 1, url: 1, ipv4: 1 } },
    indicators: [
      {
        slug: 'melbetegypt.com-1a2b3c',
        stixId: 'indicator--1',
        value: 'melbetegypt.com',
        category: 'domain',
        mainObservableType: 'Domain-Name',
        active: true,
        revoked: false,
        confidence: 95,
        score: 50,
        created: '2026-08-01T00:00:00Z',
        modified: '2026-08-10T00:00:00Z',
        validUntil: null,
        description: 'phishing site',
        sizeBytes: 10,
      },
      {
        slug: 'login-creds-evilsite-2b3c4d',
        stixId: 'indicator--2',
        value: 'https://evilsite.example/login.php',
        category: 'url',
        mainObservableType: 'Url',
        active: true,
        revoked: false,
        confidence: 90,
        score: 50,
        created: '2026-08-05T00:00:00Z',
        modified: '2026-08-12T00:00:00Z',
        validUntil: null,
        description: 'credential phishing page',
        sizeBytes: 12,
      },
      {
        slug: '185.225.19.240-59c41c',
        stixId: 'indicator--3',
        value: '185.225.19.240',
        category: 'ipv4',
        mainObservableType: 'IPv4-Addr',
        active: false,
        revoked: true,
        confidence: 100,
        score: 20,
        created: '2025-05-14T10:48:54.313Z',
        modified: '2025-05-17T22:05:48.070Z',
        validUntil: null,
        description: null,
        sizeBytes: 0,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  // The manifest index is cached module-level; reset between tests so each
  // fixture's index.json is actually read.
  _resetTiCacheForTests();
});

describe('dphish provider adapter', () => {
  it('returns malicious for an active indicator in the feed', async () => {
    const r = await dphish(
      { type: 'domain', value: 'MELBETEGYPT.com' },
      buildEnv(makeIndex()),
      AbortSignal.timeout(2000)
    );
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(85);
    expect(r.raw_summary).toMatchObject({ in_feed: true, category: 'domain', matched_value: 'melbetegypt.com' });
    expect(r.tags).toEqual(expect.arrayContaining(['dphish', 'phishing', 'active']));
  });

  it('matches domain indicators against the host of URL entries', async () => {
    const r = await dphish(
      { type: 'domain', value: 'evilsite.example' },
      buildEnv(makeIndex()),
      AbortSignal.timeout(2000)
    );
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect((r.raw_summary as Record<string, unknown>).category).toBe('url');
  });

  it('treats revoked/inactive indicators as suspicious', async () => {
    const r = await dphish({ type: 'ipv4', value: '185.225.19.240' }, buildEnv(makeIndex()), AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('suspicious');
    expect(r.score).toBe(45);
    expect(r.tags).toContain('revoked');
  });

  it('returns clean when the indicator is not in the feed', async () => {
    const r = await dphish(
      { type: 'domain', value: 'clean.example.com' },
      buildEnv(makeIndex()),
      AbortSignal.timeout(2000)
    );
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
    expect(r.score).toBe(0);
    expect(r.raw_summary).toMatchObject({ in_feed: false });
  });

  it('degrades to unsupported when ASSETS is absent', async () => {
    const env: ProviderEnv = {
      VT_API_KEY: '',
      ABUSEIPDB_API_KEY: '',
      SHODAN_API_KEY: '',
      CENSYS_PAT: '',
      CENSYS_ORG_ID: '',
      NETLAS_API_KEY: '',
      OTX_API_KEY: '',
      URLSCAN_API_KEY: '',
      HYBRID_ANALYSIS_API_KEY: '',
    };
    const r = await dphish({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.verdict).toBe('unknown');
  });
});
