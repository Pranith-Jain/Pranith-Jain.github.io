import { describe, it, expect } from 'vitest';
import { siHyposGenerate } from './si-hypos';

describe('si-hypos', () => {
  it('returns ranked hypotheses for a phish observation', async () => {
    const r = await siHyposGenerate({
      text: 'User received a phish, inbox rule created within minutes, MFA prompt approved, and then mailbox forwarding rule set to an external domain.',
      iocs: ['evil-corp.tk'],
      environment: 'email',
      topN: 5,
    });
    expect(r.hypotheses.length).toBeGreaterThan(0);
    expect(r.hypotheses.length).toBeLessThanOrEqual(5);
    // Top hypothesis should be a high-confidence phish one.
    const titles = r.hypotheses.map((h) => h.title.toLowerCase()).join(' ');
    expect(titles).toMatch(/phish|mailbox|oauth|business email/);
  });

  it('boosts hypotheses matching the environment', async () => {
    const identity = await siHyposGenerate({
      text: 'service account running interactive logon, group membership changed',
      environment: 'identity',
      topN: 3,
    });
    expect(identity.hypotheses.length).toBeGreaterThan(0);
    // Should rank identity-relevant hypotheses high
    const top = identity.hypotheses[0];
    expect(top.mitre.some((m) => /T1078|T1098|T1003/.test(m))).toBe(true);
  });

  it('returns curated corpus source', async () => {
    const r = await siHyposGenerate({ text: 'random anomaly', topN: 3 });
    expect(r.source).toBe('curated-corpus');
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns kill chain phase on each hypothesis', async () => {
    const r = await siHyposGenerate({ text: 'lsass access observed', environment: 'endpoint' });
    for (const h of r.hypotheses) {
      expect(h.killChainPhase).toMatch(/^(reconnaissance|weaponization|delivery|exploitation|installation|command-and-control|actions-on-objectives)$/);
    }
  });

  it('respects topN cap', async () => {
    const r = await siHyposGenerate({ text: 'cve', topN: 2 });
    expect(r.hypotheses.length).toBeLessThanOrEqual(2);
  });

  it('every hypothesis has signals, what-to-look-for, and sample KQL', async () => {
    const r = await siHyposGenerate({ text: 'ransomware precursor' });
    for (const h of r.hypotheses) {
      expect(h.signals.length).toBeGreaterThan(0);
      expect(h.whatToLookFor.length).toBeGreaterThan(0);
      expect(h.sampleKql).toBeTruthy();
    }
  });
});
