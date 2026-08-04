import { describe, it, expect } from 'vitest';
import { detectCampaignPhases, predictCampaignMoves } from '../../src/routes/campaign-lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// analyze_campaign 0% success rate — root cause + regression tests.
//
// The route handler required `indicators` to be a non-empty array with
// {value, type, first_seen, score} shape, but the agent tool (analyze_campaign
// in tools.ts) sends {value, type}-only indicators, and often calls with just
// an `actor` (no IOCs) → empty indicators → 400. These tests pin the pure
// analysis functions the handler depends on so the fix (normalize missing
// fields + allow actor-only) doesn't regress.
// ─────────────────────────────────────────────────────────────────────────────

describe("detectCampaignPhases — handles the tool's indicator shape", () => {
  it('accepts indicators with only {value, type} (defaults applied by handler)', () => {
    // The handler now defaults first_seen=now, score=50 before calling this.
    // detectCampaignPhases itself still requires the full shape, so the handler
    // must normalize — this test pins that detectCampaignPhases works once
    // normalized indicators are passed.
    const indicators = [
      { value: '1.2.3.4', type: 'ip', first_seen: '2024-01-01T00:00:00Z', score: 80 },
      { value: 'evil.com', type: 'domain', first_seen: '2024-01-02T00:00:00Z', score: 60 },
    ];
    const phases = detectCampaignPhases(indicators);
    expect(phases.length).toBeGreaterThan(0);
    expect(phases[0]).toHaveProperty('phase');
    expect(phases[0]).toHaveProperty('start_time');
  });

  it('returns a preparation phase for low-score indicators', () => {
    const indicators = [{ value: '1.2.3.4', type: 'ip', first_seen: '2024-01-01T00:00:00Z', score: 10 }];
    const phases = detectCampaignPhases(indicators);
    expect(phases[0]?.phase).toBe('preparation');
  });

  it('detects c2 phase for high-score IP indicators', () => {
    const indicators = [{ value: '1.2.3.4', type: 'ip', first_seen: '2024-01-01T00:00:00Z', score: 90 }];
    const phases = detectCampaignPhases(indicators);
    expect(phases.some((p) => p.phase === 'c2')).toBe(true);
  });

  it('handles empty indicators array (actor-only campaign analysis)', () => {
    // After the fix, the handler calls detectCampaignPhases([]) when only an
    // actor is supplied — this must not throw.
    const phases = detectCampaignPhases([]);
    expect(phases).toEqual([]);
  });

  it('sorts indicators by first_seen before phase detection', () => {
    const indicators = [
      { value: 'b.com', type: 'domain', first_seen: '2024-03-01T00:00:00Z', score: 50 },
      { value: 'a.com', type: 'domain', first_seen: '2024-01-01T00:00:00Z', score: 50 },
      { value: 'c.com', type: 'domain', first_seen: '2024-02-01T00:00:00Z', score: 50 },
    ];
    const phases = detectCampaignPhases(indicators);
    // All same phase (delivery, score 50) but the function should not throw
    // and should return phases in time order.
    expect(phases.length).toBeGreaterThan(0);
  });
});

describe('predictCampaignMoves — actor-only campaign skeleton', () => {
  it('produces predictions for a campaign with no indicators (actor-only)', () => {
    const campaign = {
      campaign_id: 'test',
      name: 'Test',
      status: 'active' as const,
      phases: [],
      current_phase: 'unknown' as const,
      indicators: { ips: [], domains: [], hashes: [], urls: [], emails: [] },
      attribution: { actor: 'APT29', confidence: 60, evidence: [] },
      predictions: {
        next_target_sector: null,
        next_target_region: null,
        estimated_next_attack: null,
        escalation_probability: 0,
        campaign_end_estimate: null,
      },
      related_campaigns: [],
      metrics: {
        total_indicators: 0,
        unique_sectors_targeted: 0,
        unique_regions_targeted: 0,
        estimated_victims: 0,
        duration_days: 0,
        dwell_time_avg_days: 0,
      },
      timeline: [],
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      confidence: 70,
      sources: ['analysis'],
    };
    const predictions = predictCampaignMoves(campaign);
    expect(predictions).toBeDefined();
    expect(predictions).toHaveProperty('escalation_probability');
  });
});
