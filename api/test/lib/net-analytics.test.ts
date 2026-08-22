import { describe, it, expect } from 'vitest';
import { detectBeacon, analyzeDnsTunnel } from '../../src/lib/net-analytics';

describe('detectBeacon', () => {
  it('flags a regular 60s beacon as regular with high score', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    const timestamps = Array.from({ length: 20 }, (_, i) => start + i * 60_000);
    const r = detectBeacon({ timestamps, destination: '185.220.1.5:443' });
    expect(r.connections).toBe(20);
    expect(r.verdict).toBe('regular');
    expect(r.beaconScore).toBeGreaterThanOrEqual(80);
    expect(r.suggestedInterval).toContain('60s');
  });

  it('flags jittered human traffic as irregular', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    // random-ish irregular gaps
    const gaps = [12_000, 340_000, 45_000, 210_000, 890_000, 30_000, 410_000, 77_000, 500_000, 3_000, 260_000];
    const timestamps: number[] = [start];
    for (const g of gaps) timestamps.push(timestamps[timestamps.length - 1]! + g);
    const r = detectBeacon({ timestamps });
    expect(r.verdict).toBe('irregular');
    expect(r.intervalStats.jitterRatio).toBeGreaterThan(0.35);
  });

  it('returns insufficient_data under 4 connections', () => {
    const r = detectBeacon({ timestamps: [1, 2, 3] });
    expect(r.verdict).toBe('insufficient_data');
    expect(r.beaconScore).toBe(0);
  });

  it('accepts ISO strings and epoch seconds', () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    const ts = [0, 1, 2, 3, 4].map((i) => new Date(base + i * 120_000).toISOString());
    const r = detectBeacon({ timestamps: ts });
    expect(r.verdict).toBe('regular');
    const r2 = detectBeacon({ timestamps: [base / 1000, base / 1000 + 60, base / 1000 + 120, base / 1000 + 180] });
    expect(r2.verdict).toBe('regular');
  });

  it('rewards consistent payload sizes', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    const timestamps = Array.from({ length: 12 }, (_, i) => start + i * 90_000 + (i % 2 ? 100 : -100));
    const sameBytes = Array.from({ length: 12 }, () => 512);
    const variedBytes = Array.from({ length: 12 }, (_, i) => 100 + i * 300);
    const a = detectBeacon({ timestamps, bytes: sameBytes });
    const b = detectBeacon({ timestamps, bytes: variedBytes });
    expect(a.beaconScore).toBeGreaterThan(b.beaconScore);
  });
});

describe('analyzeDnsTunnel', () => {
  const tunnelLabels = Array.from({ length: 40 }, (_, i) =>
    // long high-entropy unique labels
    `t${i}${Math.random().toString(36).slice(2)}x9f${i.toString(36)}b7qz`
  );
  const tunnelQueries = tunnelLabels.map((l) => `${l}.data.evil.example`);

  it('scores classic base32-style tunneling as likely_tunnel', () => {
    const r = analyzeDnsTunnel({ queries: tunnelQueries });
    expect(r.queriesAnalyzed).toBe(40);
    expect(r.avgLabelLength).toBeGreaterThanOrEqual(15);
    expect(r.verdict).toBe('likely_tunnel');
    expect(r.tunnelScore).toBeGreaterThanOrEqual(70);
  });

  it('passes normal short-label traffic as normal', () => {
    const queries = ['www', 'mail', 'vpn', 'api', 'intranet', 'git', 'docs'].flatMap((s) => [
      `${s}.corp.example`,
      `${s}2.corp.example`,
    ]);
    const r = analyzeDnsTunnel({ queries });
    expect(r.verdict).toBe('normal');
    expect(r.tunnelScore).toBeLessThan(40);
  });

  it('respects an explicit zone filter', () => {
    const queries = [...tunnelQueries.slice(0, 20), 'www.google.com', 'mail.google.com'];
    const r = analyzeDnsTunnel({ queries, zone: 'data.evil.example' });
    expect(r.queriesAnalyzed).toBe(20);
  });

  it('reports insufficient volume for tiny samples', () => {
    const r = analyzeDnsTunnel({ queries: ['abc.evil.com', 'def.evil.com'] });
    expect(r.indicators.some((i) => /insufficient volume/i.test(i))).toBe(true);
    expect(r.verdict).not.toBe('likely_tunnel');
  });

  it('includes sample labels for analyst pivoting', () => {
    const r = analyzeDnsTunnel({ queries: tunnelQueries });
    expect(r.sampleLabels.length).toBeGreaterThan(0);
    expect(r.sampleLabels.length).toBeLessThanOrEqual(5);
  });
});
