import { describe, it, expect } from 'vitest';
import { buildPrompt, requiredSections } from '../../../src/case-study/generation/templates';

describe('buildPrompt', () => {
  it('CVE prompt contains all required outline sections', () => {
    const { system, user } = buildPrompt({
      type: 'cve',
      title: 'CVE-2026-1234',
      facts: { cveId: 'CVE-2026-1234', vendor: 'Fortinet' },
      sources: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1234', title: 'NVD' }],
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

  it('structured types get answer-engine sections (TL;DR + FAQ) and AEO/estimative directives', () => {
    const { system, user } = buildPrompt({
      type: 'cve',
      title: 'CVE-2026-1234',
      facts: {},
      sources: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1234', title: 'NVD' }],
    });
    // Outline carries the answer-first TL;DR (lead) and a FAQ before References.
    expect(user).toContain('## TL;DR');
    expect(user).toContain('## FAQ');
    const tldrIdx = user.indexOf('## TL;DR');
    const faqIdx = user.indexOf('## FAQ');
    const refsIdx = user.indexOf('## References');
    expect(tldrIdx).toBeLessThan(faqIdx);
    expect(faqIdx).toBeLessThan(refsIdx);
    // System prompt carries the 2026 AEO + estimative-language directives.
    expect(system).toContain('<answer-engine>');
    expect(system).toContain('<estimative-language>');
    // requiredSections mirrors the outline so QA tracking stays in sync.
    const req = requiredSections('cve');
    expect(req).toContain('## TL;DR');
    expect(req).toContain('## FAQ');
  });

  it('analysis type (free-form) is unaffected by AEO sections', () => {
    expect(requiredSections('analysis')).toEqual([]);
    const { user } = buildPrompt({ type: 'analysis', title: 'A framework', facts: {} });
    expect(user).not.toContain('## TL;DR');
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

  it('clamps an oversized non-briefing evidence blob to fit the context window', () => {
    // The 180K-token / error-5021 publish_failed cause: unbounded evidence.
    const huge = {
      summary: 'x'.repeat(50),
      sections: Array.from({ length: 200 }, (_, i) => ({
        title: `Section ${i}`,
        body: 'lorem ipsum '.repeat(2000),
      })),
    };
    const { user } = buildPrompt({ type: 'intel', title: 'Big intel dump', facts: huge });
    // Raw JSON.stringify(huge) is ~5M chars; must be bounded well under
    // even the smallest model window (24k tok ≈ ~96k chars).
    expect(user.length).toBeLessThan(40_000);
    expect(user).toMatch(/truncated/i);
    expect(user).toContain('Big intel dump');
    expect(user).toContain('## ');
  });

  it('briefing uses a compact high-signal digest with real specifics, not raw JSON', () => {
    const facts = {
      date_range: '2026-05-11 – 2026-05-17',
      executive_summary: 'Heavy week.',
      stats: { findings: 879, kevs: 2, critical: 145 },
      sections: [
        {
          id: 'kev',
          title: 'CISA KEV additions',
          findings: [
            {
              id: 'CVE-2026-9999',
              vendor: 'Cisco',
              product: 'IOS XE',
              severity: 'critical',
              cvss: 9.8,
              cwes: ['CWE-78'],
              description: 'Command injection in the web UI.',
            },
          ],
        },
        {
          id: 'critical',
          title: 'Critical CVEs',
          findings: [
            {
              id: 'CVE-2026-42607',
              vendor: 'Grav',
              product: 'CMS',
              severity: 'critical',
              cvss: 9.1,
              cwes: ['CWE-94'],
              description: 'Template injection RCE.',
            },
          ],
        },
      ],
      iocs: { domains: ['evil-briefing-sample.test', 'b.test'], ipv4s: ['203.0.113.9'], hashes: [], urls: [] },
      mitre_techniques: ['T1059', 'T1190'],
    };
    const { user } = buildPrompt({ type: 'briefing', title: 'Weekly Threat Briefing', facts });
    expect(user.length).toBeLessThan(20_000);
    // Digest, not raw JSON dump.
    expect(user).not.toContain('"executive_summary":');
    // Real specifics the model must use.
    expect(user).toContain('CVE-2026-9999');
    expect(user).toContain('CVE-2026-42607');
    expect(user).toContain('Cisco');
    expect(user).toContain('CVSS 9.8');
    expect(user).toContain('evil-briefing-sample.test'); // real IOC, not a count
    expect(user).toMatch(/KEV/i);
    expect(user).toContain('BRIEFING-SPECIFIC REQUIREMENTS');
  });
});
