import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { predictionsHandler } from '../../src/routes/predictions';
import { eligible, normalizeMarket, type RawMarket } from '../../src/lib/manifold';

function raw(over: Partial<RawMarket> = {}): RawMarket {
  return {
    id: 'm1',
    question: 'Will an AI pass a hard cybersecurity exam by 2027?',
    slug: 'ai-cyber-exam-2027',
    url: 'https://manifold.markets/x/ai-cyber-exam-2027',
    probability: 0.41,
    volume: 5000,
    totalLiquidity: 1200,
    closeTime: 1893456000000,
    outcomeType: 'BINARY',
    isResolved: false,
    ...over,
  };
}

describe('manifold eligibility', () => {
  it('accepts open binary markets with real liquidity', () => {
    expect(eligible(raw())).toBe(true);
  });
  it('rejects resolved markets', () => {
    expect(eligible(raw({ isResolved: true }))).toBe(false);
  });
  it('rejects non-binary markets (no clean probability)', () => {
    expect(eligible(raw({ outcomeType: 'MULTIPLE_CHOICE' }))).toBe(false);
  });
  it('rejects illiquid markets', () => {
    expect(eligible(raw({ totalLiquidity: 5 }))).toBe(false);
  });
});

describe('manifold normalize', () => {
  it('maps a binary market into the envelope shape with Yes/No outcomes', () => {
    const m = normalizeMarket(raw(), 'cyber');
    expect(m).not.toBeNull();
    expect(m!.bucket).toBe('cyber');
    expect(m!.url).toBe('https://manifold.markets/x/ai-cyber-exam-2027');
    expect(m!.probability).toBeCloseTo(0.41);
    expect(m!.outcomes).toEqual([
      { name: 'Yes', price: 0.41 },
      { name: 'No', price: expect.closeTo(0.59) },
    ]);
    expect(m!.liquidity).toBe(1200);
    expect(typeof m!.end_date).toBe('string');
  });
  it('drops markets with no question', () => {
    expect(normalizeMarket(raw({ question: '' }), 'ai')).toBeNull();
  });
  it('clamps probability to 0..1', () => {
    expect(normalizeMarket(raw({ probability: 1.5 }), 'tech')!.probability).toBe(1);
  });
});

function app() {
  const a = new Hono<{ Bindings: Env }>();
  a.get('/api/v1/predictions', predictionsHandler);
  return a;
}

describe('GET /api/v1/predictions', () => {
  it('returns a 200 Manifold envelope and is fail-soft when upstream is unreachable', async () => {
    const r = await app().request('/api/v1/predictions', {}, {} as Env);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      total: number;
      source: string;
      buckets: { cyber: unknown[]; tech: unknown[]; ai: unknown[] };
    };
    expect(body.source).toBe('Manifold');
    expect(typeof body.total).toBe('number');
    expect(body.buckets).toHaveProperty('cyber');
    expect(body.buckets).toHaveProperty('tech');
    expect(body.buckets).toHaveProperty('ai');
  }, 20_000);
});
