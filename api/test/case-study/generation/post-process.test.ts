import { describe, it, expect } from 'vitest';
import { postProcess } from '../../../src/case-study/generation/post-process';

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

  it('fails on hallucinated CVE', () => {
    const raw =
      `## What is this vulnerability?\n\nReferences CVE-9999-9999 not in facts.\n\n` +
      `## Affected products\n\nx\n\n## CVSS score breakdown\n\nx\n\n` +
      `## How the attack works\n\nx\n\n## Why this matters\n\nx\n\n` +
      `## Indicators of compromise\n\nx\n\n## Detection & mitigation\n\nx\n\n` +
      `## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234 only' });
    expect(out.ok).toBe(false);
    expect(out.errors.join('|')).toMatch(/hallucinated cve/i);
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
});
