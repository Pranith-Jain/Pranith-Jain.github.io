import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { predictionsHandler } from '../../src/routes/predictions';
import { bucketize, classifyMarket, normalizeMarket } from '../../src/lib/polymarket';

// A market both tag-tagged and keyword-matchable, with JSON-string outcomes
// like the real Gamma API returns.
function raw(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    question: 'Will OpenAI release GPT-6 before 2027?',
    slug: 'openai-gpt6-2027',
    outcomes: '["Yes", "No"]',
    outcomePrices: '["0.62", "0.38"]',
    volumeNum: 1_000_000,
    liquidityNum: 200_000,
    endDate: '2026-12-31T00:00:00Z',
    active: true,
    closed: false,
    ...over,
  };
}

describe('polymarket classification', () => {
  it('classifies AI markets via keyword', () => {
    expect(classifyMarket(raw())).toBe('ai');
  });

  it('classifies cyber markets via keyword, with precedence over tech', () => {
    // mentions both a cyber term and a tech brand → cyber wins
    expect(classifyMarket(raw({ question: 'Will Microsoft suffer a major data breach in 2026?' }))).toBe('cyber');
  });

  it('classifies tech markets', () => {
    expect(classifyMarket(raw({ question: 'Will Apple ship a foldable iPhone in 2026?' }))).toBe('tech');
  });

  it('classifies via native tag label when the question has no keyword', () => {
    expect(classifyMarket(raw({ question: 'Will the thing happen?', tags: [{ label: 'AI' }] }))).toBe('ai');
  });

  it('returns null for unrelated markets', () => {
    expect(classifyMarket(raw({ question: 'Will the Lakers win the 2026 NBA finals?' }))).toBeNull();
  });

  it('does not match "ai" as a substring (word boundary)', () => {
    expect(classifyMarket(raw({ question: 'Will the chair be repaired by Friday?' }))).toBeNull();
  });
});

describe('polymarket normalize', () => {
  it('parses JSON-string outcomes and computes top probability', () => {
    const m = normalizeMarket(raw(), 'ai');
    expect(m).not.toBeNull();
    expect(m!.outcomes).toEqual([
      { name: 'Yes', price: 0.62 },
      { name: 'No', price: 0.38 },
    ]);
    expect(m!.probability).toBeCloseTo(0.62);
    expect(m!.url).toBe('https://polymarket.com/market/openai-gpt6-2027');
    expect(m!.volume).toBe(1_000_000);
  });

  it('drops markets missing a question or slug', () => {
    expect(normalizeMarket(raw({ slug: '' }), 'ai')).toBeNull();
  });
});

describe('bucketize', () => {
  it('ranks by volume+liquidity and excludes closed/archived', () => {
    const markets = [
      raw({ id: 'lo', slug: 'lo', question: 'Will GPT-6 ship?', volumeNum: 10 }),
      raw({ id: 'hi', slug: 'hi', question: 'Will Claude 5 ship?', volumeNum: 9_000_000 }),
      raw({ id: 'closed', slug: 'closed', question: 'Old AI market', closed: true, volumeNum: 99_000_000 }),
    ];
    const buckets = bucketize(markets);
    expect(buckets.ai.map((m) => m.slug)).toEqual(['hi', 'lo']); // ranked, closed excluded
    expect(buckets.cyber).toHaveLength(0);
  });
});

function app() {
  const a = new Hono<{ Bindings: Env }>();
  a.get('/api/v1/predictions', predictionsHandler);
  return a;
}

describe('GET /api/v1/predictions', () => {
  it('returns a 200 envelope and is fail-soft when upstream is unreachable', async () => {
    // No KV binding + sandboxed network → fetchPredictions resolves to empty
    // buckets; the route must still 200 with a well-formed envelope (never 500).
    const r = await app().request('/api/v1/predictions', {}, {} as Env);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      total: number;
      source: string;
      buckets: { cyber: unknown[]; tech: unknown[]; ai: unknown[] };
    };
    expect(body.source).toBe('Polymarket');
    expect(typeof body.total).toBe('number');
    expect(body.buckets).toHaveProperty('cyber');
    expect(body.buckets).toHaveProperty('tech');
    expect(body.buckets).toHaveProperty('ai');
  }, 20_000); // upstream is unreachable in the test sandbox; allow the fail-soft fetch to abort
});
