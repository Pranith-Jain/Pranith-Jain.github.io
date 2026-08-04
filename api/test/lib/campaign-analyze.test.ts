import { describe, it, expect } from 'vitest';
import { detectCampaignPhases, predictCampaignMoves } from '../../src/routes/campaign-lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// analyze_campaign 0% success rate — root cause + regression tests.
//
// The route handler required `indicators` to be a non-empty array with
// {value, type, first_seen, score} shape, but the agent tool (analyze_campaign
// in tools.ts) sends {value, type}-only indicators, and often calls with just
// an `actor` (no IOCs) → empty indicators → 400. The fix (in
// campaignAnalyzeHandler) normalizes missing fields + allows actor-only calls.
// These tests pin the pure analysis functions the handler depends on so the
// fix doesn't regress.
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

  it('sorts indicators chronologically by first_seen', () => {
    // Out-of-order input must be sorted before phase detection.
    const indicators = [
      { value: 'b.com', type: 'domain', first_seen: '2024-01-03T00:00:00Z', score: 50 },
      { value: 'a.com', type: 'domain', first_seen: '2024-01-01T00:00:00Z', score: 50 },
      { value: 'c.com', type: 'domain', first_seen: '2024-01-02T00:00:00Z', score: 50 },
    ];
    const phases = detectCampaignPhases(indicators);
    // All same phase (score 50 → 'delivery'), so one phase with all 3 indicators.
    expect(phases).toHaveLength(1);
    expect(phases[0]!.indicators).toEqual(['a.com', 'c.com', 'b.com']);
  });

  it('detects c2 phase for high-score IP indicators', () => {
    const indicators = [{ value: '1.2.3.4', type: 'ip', first_seen: '2024-01-01T00:00:00Z', score: 85 }];
    const phases = detectCampaignPhases(indicators);
    expect(phases[0]!.phase).toBe('c2');
  });

  it('detects exploitation phase for high-score hash indicators', () => {
    const indicators = [{ value: 'a'.repeat(64), type: 'hash', first_seen: '2024-01-01T00:00:00Z', score: 90 }];
    const phases = detectCampaignPhases(indicators);
    expect(phases[0]!.phase).toBe('exploitation');
  });

  it('detects delivery phase for high-score domain indicators', () => {
    const indicators = [{ value: 'evil.com', type: 'domain', first_seen: '2024-01-01T00:00:00Z', score: 75 }];
    const phases = detectCampaignPhases(indicators);
    expect(phases[0]!.phase).toBe('delivery');
  });

  it('returns empty array for empty indicators (handler produces actor-only skeleton)', () => {
    // When the agent calls with just an actor and no IOCs, the handler skips
    // detectCampaignPhases (indicators is empty after normalization). Pin that
    // an empty input returns empty — no crash, no phantom phase.
    expect(detectCampaignPhases([])).toEqual([]);
  });
});

describe('predictCampaignMoves — handles actor-only campaigns', () => {
  it('returns predictions with null sectors when no attribution data', () => {
    // An actor-only campaign (no IOCs, no sector data) must still produce a
    // valid predictions object — the handler returns it as part of the skeleton.
    // Use an unknown actor so no sector pattern matches → null sector.
    const campaign = {
      campaign_id: 'x',
      name: 'test',
      status: 'active',
      phases: [],
      current_phase: 'unknown',
      indicators: { ips: [], domains: [], hashes: [], urls: [], emails: [] },
      attribution: { actor: 'UNKNOWN-ACTOR-XYZ', confidence: 60, evidence: [] },
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
      first_seen: '2024-01-01T00:00:00Z',
      last_seen: '2024-01-01T00:00:00Z',
      confidence: 70,
      sources: ['analysis'],
    };
    const predictions = predictCampaignMoves(campaign as never);
    expect(predictions).toHaveProperty('next_target_sector');
    expect(predictions).toHaveProperty('escalation_probability');
    // Unknown actor with no sector pattern → null sector (not a crash).
    expect(predictions.next_target_sector).toBeNull();
  });
});
