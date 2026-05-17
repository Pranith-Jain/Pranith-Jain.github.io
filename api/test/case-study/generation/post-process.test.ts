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
});
