import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchPsi, fetchPsiBatch } from '../../src/perf/psi';

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1850, category: 'FAST' },
        INTERACTION_TO_NEXT_PAINT: { percentile: 95, category: 'FAST' },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: 'FAST' },
      },
    },
    lighthouseResult: {
      categories: {
        performance: { score: 0.94 },
        accessibility: { score: 0.98 },
        'best-practices': { score: 0.96 },
        seo: { score: 1 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 1820 },
        'total-blocking-time': { numericValue: 30 },
        'cumulative-layout-shift': { numericValue: 0.02 },
        'first-contentful-paint': { numericValue: 1200 },
        'speed-index': { numericValue: 2100 },
      },
    },
    ...overrides,
  };
}

function installFetch(
  handler: (url: string) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : (url as URL).toString();
      const r = await Promise.resolve(handler(u));
      return new Response(r.body !== undefined ? JSON.stringify(r.body) : '', { status: r.status });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPsi', () => {
  it('parses Lighthouse scores + lab CWV from a successful PSI response', async () => {
    installFetch(() => ({ status: 200, body: fixture() }));
    const r = await fetchPsi('https://example.com', 'mobile');
    expect(r.error).toBeUndefined();
    expect(r.scores).toEqual({
      performance: 0.94,
      accessibility: 0.98,
      best_practices: 0.96,
      seo: 1,
    });
    expect(r.lab.lcp_ms).toBe(1820);
    expect(r.lab.tbt_ms).toBe(30);
    expect(r.lab.cls).toBe(0.02);
  });

  it('surfaces field CWV from CrUX when present', async () => {
    installFetch(() => ({ status: 200, body: fixture() }));
    const r = await fetchPsi('https://example.com', 'mobile');
    expect(r.field).toBeDefined();
    expect(r.field?.lcp_ms).toBe(1850);
    expect(r.field?.lcp_category).toBe('FAST');
    expect(r.field?.inp_ms).toBe(95);
    expect(r.field?.cls).toBe(5);
  });

  it('leaves field undefined when CrUX has no data for the URL', async () => {
    installFetch(() => ({
      status: 200,
      body: { lighthouseResult: fixture().lighthouseResult },
    }));
    const r = await fetchPsi('https://low-traffic.example', 'mobile');
    expect(r.field).toBeUndefined();
    expect(r.scores.performance).toBe(0.94);
  });

  it('captures non-200 responses in the error field rather than throwing', async () => {
    installFetch(() => ({ status: 429 }));
    const r = await fetchPsi('https://example.com', 'mobile');
    expect(r.error).toBe('psi http 429');
    expect(r.scores).toEqual({});
    expect(r.lab).toEqual({});
  });

  it('captures network failures in the error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    const r = await fetchPsi('https://example.com', 'desktop');
    expect(r.error).toMatch(/network down/);
  });

  it('passes strategy and category parameters in the query string', async () => {
    const seen: string[] = [];
    installFetch((url) => {
      seen.push(url);
      return { status: 200, body: fixture() };
    });
    await fetchPsi('https://example.com', 'desktop', { apiKey: 'k-123' });
    expect(seen[0]).toContain('strategy=desktop');
    expect(seen[0]).toContain('category=performance');
    expect(seen[0]).toContain('category=accessibility');
    expect(seen[0]).toContain('category=best-practices');
    expect(seen[0]).toContain('category=seo');
    expect(seen[0]).toContain('key=k-123');
  });
});

describe('fetchPsiBatch', () => {
  it('returns results in the same order as the input targets', async () => {
    let i = 0;
    installFetch(() => {
      i += 1;
      const score = i / 10;
      return {
        status: 200,
        body: {
          lighthouseResult: {
            categories: { performance: { score } },
            audits: {},
          },
        },
      };
    });
    const r = await fetchPsiBatch([
      { url: 'https://a', strategy: 'mobile' },
      { url: 'https://b', strategy: 'desktop' },
      { url: 'https://c', strategy: 'mobile' },
    ]);
    expect(r).toHaveLength(3);
    expect(r[0]!.url).toBe('https://a');
    expect(r[0]!.scores.performance).toBe(0.1);
    expect(r[2]!.scores.performance).toBe(0.3);
  });

  it('one failed target does not break the others', async () => {
    let n = 0;
    installFetch(() => {
      n += 1;
      if (n === 2) return { status: 500 };
      return { status: 200, body: fixture() };
    });
    const r = await fetchPsiBatch([
      { url: 'https://a', strategy: 'mobile' },
      { url: 'https://b', strategy: 'mobile' },
      { url: 'https://c', strategy: 'mobile' },
    ]);
    expect(r).toHaveLength(3);
    expect(r[0]!.error).toBeUndefined();
    expect(r[1]!.error).toBe('psi http 500');
    expect(r[2]!.error).toBeUndefined();
  });
});
