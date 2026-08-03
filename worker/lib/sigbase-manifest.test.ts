/**
 * Tests for the Signature-Base manifest loader.
 *
 * We stub env.ASSETS with an in-memory map of {path -> json} so the
 * tests don't need real Cloudflare bindings. Run via:
 *   npx vitest run worker/lib/sigbase-manifest.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSigBaseIndex,
  getSigBaseYara,
  getSigBaseIoc,
  filterYara,
  filterIocs,
  searchIocEntries,
  sigBaseCacheStats,
  _resetSigBaseCacheForTests,
  type SigBaseIndex,
  type SigBaseYaraBody,
  type SigBaseIocBody,
} from './sigbase-manifest';

function makeAssetsFixture() {
  const data = new Map<string, unknown>();
  const idx: SigBaseIndex = {
    source: 'github.com/Neo23x0/signature-base',
    license: 'Detection Rule License 1.1',
    replicatedAt: '2026-08-03',
    counts: { yaraFiles: 2, yaraRules: 3, iocFiles: 2, iocEntries: 5, externalVarFiles: 1 },
    yaraIndex: [
      {
        slug: 'apt_apt28',
        filename: 'apt_apt28.yar',
        identifier: 'APT28',
        ruleCount: 2,
        tags: ['apt'],
        author: 'Florian Roth (Nextron Systems)',
        date: '2015-06-02',
        score: 60,
        externalVars: false,
        sizeBytes: 5000,
      },
      {
        slug: 'gen_webshells_ext_vars',
        filename: 'gen_webshells_ext_vars.yar',
        identifier: null,
        ruleCount: 1,
        tags: ['gen'],
        author: 'Florian Roth (Nextron Systems)',
        date: '2017-01-01',
        score: null,
        externalVars: true,
        sizeBytes: 2000,
      },
    ],
    iocIndex: [
      { slug: 'hash-iocs', title: 'Evil Hashes (MD5/SHA1/SHA256)', type: 'hash', entryCount: 3, sizeBytes: 100 },
      { slug: 'c2-iocs', title: 'C2 Servers and Domains', type: 'c2', entryCount: 2, sizeBytes: 50 },
    ],
  };
  data.set('/data/sigbase/index.json', idx);

  const yara: SigBaseYaraBody = {
    slug: 'apt_apt28',
    filename: 'apt_apt28.yar',
    identifier: 'APT28',
    ruleCount: 2,
    tags: ['apt'],
    author: 'Florian Roth (Nextron Systems)',
    date: '2015-06-02',
    score: 60,
    externalVars: false,
    sizeBytes: 5000,
    source: 'github.com/Neo23x0/signature-base',
    license: 'Detection Rule License 1.1',
    headerComment: 'Yara Rule Set',
    rules: [
      { name: 'APT28_CHOPSTICK', meta: { description: 'Detects CHOPSTICK', author: 'Florian Roth' } },
      { name: 'APT28_SourFace_Malware1', meta: { description: 'Detects SOURFACE' } },
    ],
    body: 'rule APT28_CHOPSTICK {\n  meta:\n    description = "Detects CHOPSTICK"\n}',
  };
  data.set('/data/sigbase/yara/apt_apt28.json', yara);

  const ioc: SigBaseIocBody = {
    slug: 'hash-iocs',
    title: 'Evil Hashes (MD5/SHA1/SHA256)',
    type: 'hash',
    entryCount: 3,
    sizeBytes: 100,
    source: 'github.com/Neo23x0/signature-base',
    license: 'Detection Rule License 1.1',
    entries: [
      { value: '0c2674c3a97c53082187d930efb645c2', comment: 'DEEP PANDA Sakula', type: 'md5' },
      { value: '563d1512178cec1f6a73c98d565c98fa', comment: 'Cygwin nc.exe example', type: 'md5' },
      {
        value: 'ce583821191345274cd954b2db7da9742c239fe413fc17dcb97ffdd7b51cb072',
        comment: 'Dark Caracal',
        type: 'sha256',
      },
    ],
  };
  data.set('/data/sigbase/iocs/hash-iocs.json', ioc);

  const assets = {
    fetch: vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname;
      const hit = data.get(path);
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(hit), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  };
  return { assets, data };
}

describe('sigbase-manifest', () => {
  beforeEach(() => {
    _resetSigBaseCacheForTests();
  });

  it('loads the slim index', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadSigBaseIndex(assets as unknown as Fetcher);
    expect(idx.counts.yaraFiles).toBe(2);
    expect(idx.counts.yaraRules).toBe(3);
    expect(idx.counts.iocEntries).toBe(5);
    expect(idx.yaraIndex[0]!.slug).toBe('apt_apt28');
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws a helpful error when the index is missing', async () => {
    const assets = { fetch: vi.fn(async () => new Response('not found', { status: 404 })) };
    await expect(loadSigBaseIndex(assets as unknown as Fetcher)).rejects.toThrow(/build-sigbase-manifest/);
  });

  it('fetches and caches a YARA rule body', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getSigBaseYara(assets as unknown as Fetcher, 'apt_apt28');
    expect(body?.rules[0]!.name).toBe('APT28_CHOPSTICK');
    expect(body?.body).toContain('rule APT28_CHOPSTICK');
    const again = await getSigBaseYara(assets as unknown as Fetcher, 'apt_apt28');
    expect(again).toBe(body);
    const stats = sigBaseCacheStats();
    expect(stats.yara.hits).toBe(1);
    expect(stats.yara.misses).toBe(1);
  });

  it('returns null for an unknown rule slug', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getSigBaseYara(assets as unknown as Fetcher, 'nope')).toBeNull();
  });

  it('filters rule files by tag, author, externalVars, and keyword', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadSigBaseIndex(assets as unknown as Fetcher);

    const apt = filterYara(idx, { tag: 'apt' });
    expect(apt.map((r) => r.slug)).toEqual(['apt_apt28']);

    const ext = filterYara(idx, { externalVars: true });
    expect(ext.map((r) => r.slug)).toEqual(['gen_webshells_ext_vars']);

    const byAuthor = filterYara(idx, { author: 'roth' });
    expect(byAuthor.length).toBe(2);

    const byKeyword = filterYara(idx, { keyword: 'APT28' });
    expect(byKeyword.map((r) => r.slug)).toEqual(['apt_apt28']);

    const limited = filterYara(idx, { limit: 1 });
    expect(limited.length).toBe(1);
  });

  it('filters IOC lists by type and keyword', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadSigBaseIndex(assets as unknown as Fetcher);
    const hashes = filterIocs(idx, { type: 'hash' });
    expect(hashes.map((i) => i.slug)).toEqual(['hash-iocs']);
    const byKeyword = filterIocs(idx, { keyword: 'c2' });
    expect(byKeyword.map((i) => i.slug)).toEqual(['c2-iocs']);
  });

  it('fetches an IOC body and searches its entries', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getSigBaseIoc(assets as unknown as Fetcher, 'hash-iocs');
    expect(body?.entryCount).toBe(3);

    const dark = searchIocEntries(body!, 'dark');
    expect(dark.length).toBe(1);
    expect(dark[0]!.type).toBe('sha256');

    const md5s = searchIocEntries(body!, undefined);
    expect(md5s.length).toBe(3);
  });

  it('returns null for an unknown IOC list slug', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getSigBaseIoc(assets as unknown as Fetcher, 'nope')).toBeNull();
  });

  it('tracks cache stats for both caches', async () => {
    const { assets } = makeAssetsFixture();
    await getSigBaseYara(assets as unknown as Fetcher, 'apt_apt28');
    await getSigBaseIoc(assets as unknown as Fetcher, 'hash-iocs');
    const stats = sigBaseCacheStats();
    expect(stats.yara.size).toBe(1);
    expect(stats.iocs.size).toBe(1);
    expect(stats.indexLoaded).toBe(false);
  });
});
