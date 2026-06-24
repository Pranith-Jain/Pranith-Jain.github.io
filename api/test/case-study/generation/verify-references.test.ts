import { describe, it, expect } from 'vitest';
import { extractReferenceUrls, verifyAndPruneReferences } from '../../../src/case-study/generation/verify-references';
import type { LinkStatus } from '../../../src/lib/verify-url';

/** Build a deterministic verify fn from a fixed status map (no network). */
function stubVerify(map: Record<string, LinkStatus>) {
  return async (urls: string[]) => {
    const out = new Map<string, LinkStatus>();
    for (const u of urls) out.set(u, map[u] ?? 'unchecked');
    return out;
  };
}

describe('extractReferenceUrls', () => {
  it('pulls markdown-link URLs from the ## References section only', () => {
    const body = [
      '## Summary',
      'See [an inline link](https://inline.example/should-not-count).',
      '',
      '## References',
      '- [BleepingComputer](https://www.bleepingcomputer.com/news/security/real-slug/)',
      '- [The Hacker News](https://thehackernews.com/2026/01/story.html)',
      '',
      '## Footer',
      '- [ignored](https://after.example/x)',
    ].join('\n');
    const urls = extractReferenceUrls(body);
    expect(urls).toEqual([
      'https://www.bleepingcomputer.com/news/security/real-slug/',
      'https://thehackernews.com/2026/01/story.html',
    ]);
  });

  it('returns empty when there is no References section', () => {
    expect(extractReferenceUrls('## Summary\nNo refs here.')).toEqual([]);
  });
});

describe('verifyAndPruneReferences — sources list', () => {
  it('drops sources whose URL is a confirmed broken (4xx/5xx) link', async () => {
    const result = await verifyAndPruneReferences({
      body: '## Summary\nbody\n\n## References\n- [ok](https://good.example/a)',
      sources: [
        { url: 'https://good.example/a', title: 'Good' },
        { url: 'https://valid-host.example/fabricated-path', title: 'Fabricated' },
      ],
      verify: stubVerify({
        'https://good.example/a': 'ok',
        'https://valid-host.example/fabricated-path': 'broken',
      }),
    });
    expect(result.sources.map((s) => s.url)).toEqual(['https://good.example/a']);
    expect(result.report.droppedSources).toBe(1);
  });

  it('keeps sources that are unchecked (transient network error), not just ok', async () => {
    const result = await verifyAndPruneReferences({
      body: '## Summary\nbody',
      sources: [{ url: 'https://maybe.example/x', title: 'Maybe' }],
      verify: stubVerify({ 'https://maybe.example/x': 'unchecked' }),
    });
    expect(result.sources.map((s) => s.url)).toEqual(['https://maybe.example/x']);
    expect(result.report.droppedSources).toBe(0);
  });
});

describe('verifyAndPruneReferences — body References section', () => {
  it('removes a reference bullet whose URL is a confirmed broken link, keeping the good one', async () => {
    const body = [
      '## Summary',
      'body text',
      '',
      '## References',
      '- [Good source](https://good.example/a)',
      '- [Fabricated path](https://www.bleepingcomputer.com/news/security/made-up-slug/)',
      '',
    ].join('\n');
    const result = await verifyAndPruneReferences({
      body,
      sources: [],
      verify: stubVerify({
        'https://good.example/a': 'ok',
        'https://www.bleepingcomputer.com/news/security/made-up-slug/': 'broken',
      }),
    });
    expect(result.body).toContain('https://good.example/a');
    expect(result.body).not.toContain('made-up-slug');
    expect(result.report.droppedRefBullets).toBe(1);
  });

  it('backs off (keeps the section) when every reference bullet would be removed', async () => {
    const body = [
      '## Summary',
      'body text',
      '',
      '## References',
      '- [Only source](https://www.bleepingcomputer.com/news/security/made-up-slug/)',
      '',
    ].join('\n');
    const result = await verifyAndPruneReferences({
      body,
      sources: [],
      verify: stubVerify({
        'https://www.bleepingcomputer.com/news/security/made-up-slug/': 'broken',
      }),
    });
    expect(result.body).toContain('made-up-slug');
    expect(result.report.backedOff).toBe(true);
    expect(result.report.droppedRefBullets).toBe(0);
  });

  it('caps the number of URLs verified to respect the subrequest budget', async () => {
    let verifiedCount = 0;
    const countingVerify = async (urls: string[]) => {
      verifiedCount += urls.length;
      const out = new Map<string, LinkStatus>();
      for (const u of urls) out.set(u, 'ok');
      return out;
    };
    const sources = Array.from({ length: 30 }, (_, i) => ({
      url: `https://host${i}.example/p`,
      title: `s${i}`,
    }));
    await verifyAndPruneReferences({
      body: '## Summary\nx',
      sources,
      verify: countingVerify,
      maxUrls: 12,
    });
    expect(verifiedCount).toBeLessThanOrEqual(12);
  });
});
