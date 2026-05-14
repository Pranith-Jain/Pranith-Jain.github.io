import { describe, it, expect } from 'vitest';
import { postProcess } from '../../../src/case-study/generation/post-process';

describe('postProcess', () => {
  it('strips preamble and validates required sections', () => {
    const raw = `Here is the case study:\n\n## Summary\n\nText.\n\n## Affected products\n\nText.\n\n## How it works\n\nText.\n\n## Exploitation in the wild\n\nText.\n\n## Detection & mitigation\n\nText.\n\n## IOCs\n\nNone yet.\n\n## References\n\n- https://example.com\n`;
    const out = postProcess({ type: 'cve', raw, factsText: '' });
    expect(out.ok).toBe(true);
    expect(out.body.startsWith('## Summary')).toBe(true);
    expect(out.body).not.toMatch(/Here is the case study/);
  });

  it('fails when a required section is missing', () => {
    const raw = `## Summary\n\nx\n\n## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: '' });
    expect(out.ok).toBe(false);
    expect(out.errors.join('|')).toMatch(/missing section/i);
  });

  it('extracts IOCs from the body', () => {
    const raw =
      `## Summary\n\nx\n\n## Affected products\n\nx\n\n## How it works\n\nx\n\n` +
      `## Exploitation in the wild\n\nC2 1.2.3.4 and badc2.example.com\n\n` +
      `## Detection & mitigation\n\nx\n\n` +
      `## IOCs\n\n- 1.2.3.4\n- abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890\n\n` +
      `## References\n\n- https://example.com\n`;
    const out = postProcess({
      type: 'cve',
      raw,
      factsText: '1.2.3.4 abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 badc2.example.com',
    });
    expect(out.ok).toBe(true);
    const types = out.iocs.map((i) => i.type).sort();
    expect(types).toContain('ipv4');
    expect(types).toContain('sha256');
  });

  it('flags hallucinated CVE not present in facts', () => {
    const raw = `## Summary\n\nReferences CVE-9999-9999 not in facts.\n\n## Affected products\n\nx\n\n## How it works\n\nx\n\n## Exploitation in the wild\n\nx\n\n## Detection & mitigation\n\nx\n\n## IOCs\n\nNone.\n\n## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234 only' });
    expect(out.ok).toBe(false);
    expect(out.errors.join('|')).toMatch(/hallucinated cve/i);
  });
});
