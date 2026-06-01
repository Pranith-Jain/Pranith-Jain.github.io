import { describe, it, expect } from 'vitest';
import { classifySocialClaim } from '../../src/lib/social-claim-parser';

describe('classifySocialClaim — ransomware', () => {
  it('extracts victim + group from a FalconFeeds-style leak-site listing', () => {
    const c = classifySocialClaim(
      '🚨 Ransomware Alert 🚨\n\nAcme Corp has been listed as a victim by the LockBit ransomware group.'
    );
    expect(c.kind).toBe('ransomware');
    expect(c.group?.toLowerCase()).toBe('lockbit');
    expect(c.victim).toBe('Acme Corp');
  });

  it('handles "added X to their victim list"', () => {
    const c = classifySocialClaim('The DragonForce ransomware group has added Panorama BPO to their victim list.');
    expect(c.kind).toBe('ransomware');
    expect(c.group?.toLowerCase()).toBe('dragonforce');
    expect(c.victim).toBe('Panorama BPO');
  });

  it('captures the country flag prefix', () => {
    const c = classifySocialClaim(
      '🇺🇸 USA - Taos Mountain Casino has reportedly fallen victim to the Dragonforce ransomware group.'
    );
    expect(c.kind).toBe('ransomware');
    expect(c.country).toBe('USA');
    expect(c.group?.toLowerCase()).toBe('dragonforce');
  });

  it('does NOT classify a generic "ransomware" mention with no group as a victim claim', () => {
    const c = classifySocialClaim('New report: ransomware attacks rose 40% in Q2 across healthcare.');
    expect(c.kind).not.toBe('ransomware');
  });

  // Real-world false positives caught in production output:
  it('does not extract a verb as the group ("ransomware group has added …")', () => {
    const c = classifySocialClaim('The Qilin ransomware group has added 3 new victims to their leak site.');
    // group must be Qilin (not "has"); the count phrase is not a victim, so this
    // is not a clean single-victim claim and must drop out of the feed.
    expect(c.group?.toLowerCase()).not.toBe('has');
    expect(c.victim).toBeUndefined();
  });

  it('strips a trailing lowercase parenthetical descriptor but keeps an acronym', () => {
    const c = classifySocialClaim(
      'School Facility Consultants ( a US-based building and construction company ) has been listed by the Abyss ransomware group.'
    );
    expect(c.kind).toBe('ransomware');
    expect(c.group?.toLowerCase()).toBe('abyss');
    expect(c.victim).toBe('School Facility Consultants');
  });
});

describe('classifySocialClaim — breach (real DailyDarkWeb samples)', () => {
  it('extracts victim from "X Allegedly Breached"', () => {
    const c = classifySocialClaim(
      '🇻🇪 Venezuela: SENIAT Allegedly Breached, 24 Million Records Claimed Exposed https://t.co/uWQBO1l9wc'
    );
    expect(c.kind).toBe('breach');
    expect(c.country).toBe('Venezuela');
    expect(c.victim).toBe('SENIAT');
  });

  it('extracts victim from "belonging to X"', () => {
    const c = classifySocialClaim(
      '🇲🇽 Mexico - Threat actor published an alleged database belonging to Universidad Tecnológica del Centro (UTC). https://t.co/baC4m3P38t'
    );
    expect(c.kind).toBe('breach');
    expect(c.country).toBe('Mexico');
    expect(c.victim).toBe('Universidad Tecnológica del Centro (UTC)');
  });

  it('extracts victim from "associated with X"', () => {
    const c = classifySocialClaim(
      '🇮🇩 Indonesia - Threat actor is offering for sale an alleged database containing approximately 1 million records associated with POLRI personnel.'
    );
    expect(c.kind).toBe('breach');
    expect(c.country).toBe('Indonesia');
    expect(c.victim).toBe('POLRI');
  });

  it('strips trailing t.co URLs from the victim', () => {
    const c = classifySocialClaim(
      '🇪🇬 Egypt - Threat actor published an alleged database belonging to Homzmart https://t.co/ZhcXqyAKmr'
    );
    expect(c.victim).toBe('Homzmart');
  });
});

describe('classifySocialClaim — other / noise', () => {
  it('classifies channel spam / promos as other', () => {
    expect(classifySocialClaim('im cleaning the channel! pm me now to stay! @louistete').kind).toBe('other');
    expect(classifySocialClaim('Check out our new dashboard features! Sign up today.').kind).toBe('other');
  });

  it('returns other for empty / whitespace', () => {
    expect(classifySocialClaim('').kind).toBe('other');
    expect(classifySocialClaim('   \n  ').kind).toBe('other');
  });
});
