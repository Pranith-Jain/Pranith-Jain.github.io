import { describe, it, expect } from 'vitest';
import { postProcess, qaReview } from '../../../src/case-study/generation/post-process';
import type { QualityScore } from '../../../src/case-study/types';

const QS = (total: number): QualityScore => ({
  total,
  breakdown: { length: 0, sections: 0, depth: 0, technical: 0, references: 0, fillerPenalty: 0 },
});

describe('postProcess', () => {
  it('keeps hook preamble and validates required sections', () => {
    const raw =
      `A perfect 10. That's what CVSS gave CVE-2026-20182.\n\n` +
      `## What is this vulnerability?\n\nText.\n\n## Affected products\n\nText.\n\n` +
      `## CVSS score breakdown\n\nText.\n\n## How the attack works\n\nText.\n\n` +
      `## Why this matters\n\nText.\n\n## Indicators of compromise\n\nText.\n\n` +
      `## Detection & mitigation\n\nText.\n\n## References\n\n- https://nvd.nist.gov\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-20182' });
    expect(out.ok).toBe(true);
    expect(out.body).toMatch(/^A perfect 10/);
    expect(out.body).toContain('## What is this vulnerability?');
  });

  it('flags an out-of-facts CVE as a non-blocking warning (does not fail publish)', () => {
    const raw =
      `## What is this vulnerability?\n\nReferences CVE-9999-9999 not in facts.\n\n` +
      `## Affected products\n\nx\n\n## CVSS score breakdown\n\nx\n\n` +
      `## How the attack works\n\nx\n\n## Why this matters\n\nx\n\n` +
      `## Indicators of compromise\n\nx\n\n## Detection & mitigation\n\nx\n\n` +
      `## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234 only' });
    // Contextual/out-of-facts CVEs no longer hard-fail (was the dominant
    // publish_failed cause) — they surface as a warning instead.
    expect(out.ok).toBe(true);
    expect(out.errors.join('|')).toMatch(/warning: contextual cve not in facts/i);
  });

  it('extracts IOCs from the body', () => {
    const raw =
      `Hook intro here.\n\n` +
      `## What is this vulnerability?\n\nx\n\n## Affected products\n\nx\n\n` +
      `## CVSS score breakdown\n\nx\n\n## How the attack works\n\nC2 1.2.3.4 and badc2.example.com\n\n` +
      `## Why this matters\n\nx\n\n## Indicators of compromise\n\n- 1.2.3.4\n- abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890\n\n` +
      `## Detection & mitigation\n\nx\n\n## References\n\n- https://example.com\n`;
    const out = postProcess({
      type: 'cve',
      raw,
      factsText:
        '1.2.3.4 abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 badc2.example.com CVE-2026-1234',
    });
    expect(out.ok).toBe(true);
    const types = out.iocs.map((i) => i.type).sort();
    expect(types).toContain('ipv4');
    expect(types).toContain('sha256');
  });

  it('reports missing sections as non-critical errors', () => {
    const raw = `## What is this vulnerability?\n\nx\n\n## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234' });
    // Missing sections are non-critical — ok stays true
    expect(out.ok).toBe(true);
    expect(out.errors.join('|')).toMatch(/missing section/i);
  });

  it('does not extract victim or source domains as IOCs (ransom)', () => {
    const raw =
      `Inc Ransom added 5 victims this week.\n\n` +
      `## Summary\n\nDefenseisready.com and Silergy Corp were hit.\n\n` +
      `## Group profile\n\nActive group.\n\n` +
      `## Recent victims\n\nSee [disclosure](https://www.ransomlook.io/blog/disclosures/abc).\n\n` +
      `## TTPs\n\nUnknown.\n\n## Negotiation tactics\n\nUnknown.\n\n` +
      `## Defensive recommendations\n\nIsolate backups.\n\n` +
      `## References\n\n- https://www.ransomlook.io/blog/disclosures/abc\n`;
    const out = postProcess({
      type: 'ransom',
      raw,
      factsText: JSON.stringify({
        group: 'Inc Ransom',
        victims: [{ victim: 'defenseisready.com', url: 'https://www.ransomlook.io/blog/disclosures/abc' }],
      }),
    });
    expect(out.ok).toBe(true);
    const domains = out.iocs.filter((i) => i.type === 'domain').map((i) => i.value);
    expect(domains).not.toContain('defenseisready.com');
    expect(domains).not.toContain('ransomlook.io');
    expect(domains).not.toContain('www.ransomlook.io');
    expect(domains).toHaveLength(0);
  });

  it('still excludes source/ref domains for non-ransom posts', () => {
    const raw =
      `Hook.\n\n## What is this vulnerability?\n\nC2 at evil-c2.net. Patch per nvd.nist.gov.\n\n` +
      `## Affected products\n\nx\n\n## CVSS score breakdown\n\nx\n\n## How the attack works\n\nx\n\n` +
      `## Why this matters\n\nx\n\n## Indicators of compromise\n\n- evil-c2.net\n\n` +
      `## Detection & mitigation\n\nx\n\n## References\n\n- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)\n`;
    const out = postProcess({
      type: 'cve',
      raw,
      factsText: 'CVE-2026-1234 https://nvd.nist.gov/vuln/detail/CVE-2026-1234',
    });
    const domains = out.iocs.filter((i) => i.type === 'domain').map((i) => i.value);
    expect(domains).toContain('evil-c2.net');
    expect(domains).not.toContain('nvd.nist.gov');
  });

  it('sanitises em/en dashes deterministically but keeps numeric ranges', () => {
    const raw =
      `## What is this vulnerability?\n\nThis is the finding — and it matters. CVSS range 9.0–10.0 stays.\n\n` +
      `## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234' });
    expect(out.body).toContain('finding, and it matters'); // prose dash → comma
    expect(out.body).not.toContain('finding —'); // the prose em-dash is gone
    expect(out.body).toContain('9.0–10.0'); // numeric range dash preserved
  });

  it('flags egregious AI-slop as critical so the repair pass rewrites it', () => {
    const raw =
      `In today's digital landscape, attackers delve into your network.\n\n` +
      `## What is this vulnerability?\n\nIt serves as a stark reminder.\n\n` +
      `## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234' });
    expect(out.ok).toBe(false);
    expect(out.errors.join('|')).toMatch(/ai-slop detected/i);
  });

  it('qaReview passes substantive, sourced, non-repetitive content', () => {
    const body = `${'A precise, specific sentence about the finding number ' + Math.random()} ${Array.from(
      { length: 60 },
      (_, i) => `Detection insight ${i} about the access vector and blast radius.`
    ).join(
      ' '
    )}\n\n## Summary\n\nReal analysis here.\n\n## Detection\n\nHunt for X.\n\n## References\n\n- [NVD](https://nvd.nist.gov/x)`;
    const qa = qaReview(body, [{ type: 'domain', value: 'evil.test' }], 'cve', QS(70));
    expect(qa.passed).toBe(true);
    expect(qa.issues).toHaveLength(0);
  });

  it('qaReview fails thin / unsourced / repetitive / low-score content', () => {
    expect(qaReview('## A\n\nshort.', [], 'cve', QS(70)).passed).toBe(false); // thin + 1 section + unsourced
    const repeated = `${Array.from({ length: 80 }, () => 'x').join(' ')} ## A\n\nPatch immediately to stay safe now. Patch immediately to stay safe now. Patch immediately to stay safe now.\n\n## B\n\n[ref](https://x.test/a)`;
    expect(qaReview(repeated, [], 'cve', QS(70)).issues.join('|')).toMatch(/repeated sentence/i);
    const longBody = `${Array.from({ length: 400 }, (_, i) => `Sentence number ${i} about something.`).join(' ')}\n\n## A\n\nx\n\n## B\n\n[r](https://x.test/a)`;
    expect(qaReview(longBody, [], 'cve', QS(40)).issues.join('|')).toMatch(/quality score 40/);
  });

  it('does not flag clean technical prose as slop', () => {
    const raw =
      `## What is this vulnerability?\n\nCVE-2026-1234 is an unauthenticated RCE in the admin API. ` +
      `Confidence is high; the PoC is public.\n\n` +
      `## Detection & mitigation\n\nHunt for POST /api/admin with no prior auth token.\n\n` +
      `## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234' });
    expect(out.errors.join('|')).not.toMatch(/ai-slop detected/i);
  });
});
