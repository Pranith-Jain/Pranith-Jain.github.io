import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../../src/case-study/generation/templates';

describe('buildPrompt', () => {
  it('CVE prompt contains all required outline sections', () => {
    const { system, user } = buildPrompt({
      type: 'cve',
      title: 'CVE-2026-1234',
      facts: { cveId: 'CVE-2026-1234', vendor: 'Fortinet' },
    });
    expect(system).toContain('#COPYWRITING RULES');
    expect(system).toContain('#ENGAGEMENT BAIT STRATEGIES');
    expect(system).toContain('#PIPELINE OUTPUT (STRICT)');
    expect(user).toContain('## What is this vulnerability');
    expect(user).toContain('## Affected products');
    expect(user).toContain('## CVSS score breakdown');
    expect(user).toContain('## How the attack works');
    expect(user).toContain('## Why this matters');
    expect(user).toContain('## Indicators of compromise');
    expect(user).toContain('## References');
    expect(user).toContain('"cveId":"CVE-2026-1234"');
  });

  it('actor prompt has actor-specific outline', () => {
    const { user } = buildPrompt({ type: 'actor', title: 'FIN7', facts: {} });
    expect(user).toContain('## Origin');
    expect(user).toContain('## TTPs');
    expect(user).toContain('## Targeted sectors');
  });

  it('malware prompt has malware-specific outline', () => {
    const { user } = buildPrompt({ type: 'malware', title: 'Lumma', facts: {} });
    expect(user).toContain('## Capabilities');
    expect(user).toContain('## Infrastructure');
    expect(user).toContain('## Detection');
  });

  it('ransom prompt has ransomware-specific outline', () => {
    const { user } = buildPrompt({ type: 'ransom', title: 'Akira', facts: {} });
    expect(user).toContain('## Group profile');
    expect(user).toContain('## Recent victims');
    expect(user).toContain('## Defensive recommendations');
  });
});
