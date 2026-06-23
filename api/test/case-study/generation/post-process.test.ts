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

  it('strips egregious AI-slop sentences and records a non-blocking warning', () => {
    const raw =
      `In today's digital landscape, attackers delve into your network.\n\n` +
      `## What is this vulnerability?\n\nThe flaw allows unauthenticated RCE on the gateway. It serves as a stark reminder.\n\n` +
      `## References\n\n- https://x\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-1234' });
    // Egregious slop is scrubbed from the published body...
    expect(out.body).not.toMatch(/in today's digital landscape/i);
    expect(out.body).not.toMatch(/serves as a stark reminder/i);
    // ...and surfaced as a non-blocking warning rather than hard-failing the
    // whole post (hard-failing over one slop phrase was the dominant
    // publish_failed cause; the slop is stripped inline instead).
    expect(out.errors.join('|')).toMatch(/ai-slop/i);
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

  it('prunes NVD/KEV/MITRE references when the body does not cite them', () => {
    // Ransomware leak-site style post — no CVE, no KEV, no MITRE T-code
    // anywhere in the body. The model dropped the three canonical
    // authorities into ## References as filler; the post-process step
    // should strip them and keep the actually-relevant ransomlook bullet.
    const raw =
      `## NOVA campaign\n\nNOVA posted 17 new victims this week across construction and SaaS verticals.\n\n` +
      `## What the data shows\n\nThe affiliate is rotating between leak sites; activity is consistent with a single operator.\n\n` +
      `## References\n\n` +
      `- [ransomlook.io](https://www.ransomlook.io/group/nova) - 17 victim posts for this campaign\n` +
      `- [NVD](https://nvd.nist.gov) - for information on known vulnerabilities and exploits.\n` +
      `- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) - catalog of known exploited vulnerabilities.\n` +
      `- [MITRE ATT&CK](https://attack.mitre.org) - for tactics, techniques, and procedures used by threat actors.\n`;
    const out = postProcess({ type: 'ransom', raw, factsText: 'NOVA 17 victims' });
    expect(out.body).toContain('ransomlook.io');
    expect(out.body).not.toMatch(/\bNVD\b/);
    expect(out.body).not.toMatch(/CISA KEV/);
    expect(out.body).not.toMatch(/MITRE ATT&CK/);
  });

  it('keeps NVD/KEV/MITRE references when the body actually cites them', () => {
    const raw =
      `## What is this vulnerability?\n\nCVE-2026-9999 is a KEV-listed RCE; technique T1190 was observed.\n\n` +
      `## References\n\n` +
      `- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-9999) - CVE record.\n` +
      `- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) - KEV entry.\n` +
      `- [MITRE ATT&CK](https://attack.mitre.org/techniques/T1190/) - T1190 Exploit Public-Facing Application.\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-9999' });
    expect(out.body).toContain('NVD');
    expect(out.body).toContain('CISA KEV');
    expect(out.body).toContain('MITRE ATT&CK');
  });

  it('strips reference bullets pointing at fabricated hosts', () => {
    const raw =
      `## Background\n\nCVE-2026-9999 is a KEV-listed RCE.\n\n` +
      `## References\n\n` +
      `- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-9999) - CVE record.\n` +
      `- [Krebs](https://krebsonsecurity.com/article) - news writeup.\n` +
      `- [Fake research lab](https://imaginary-research-lab.notarealdomain.example) - hallucinated source.\n` +
      `- [Another fake](https://blog.notacompany.invalid/post/123) - also fabricated.\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-9999' });
    expect(out.body).toContain('NVD');
    expect(out.body).toContain('krebsonsecurity.com');
    expect(out.body).not.toContain('imaginary-research-lab');
    expect(out.body).not.toContain('notacompany.invalid');
  });

  it('keeps refs whose host appears in the candidate factsText even if not in the static allowlist', () => {
    const raw =
      `## Background\n\nCVE-2026-9999 is a KEV-listed RCE.\n\n` +
      `## References\n\n` +
      `- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-9999) - CVE record.\n` +
      `- [Per-post source](https://niche-vendor-blog.example.co/advisory/123) - relevant for this case.\n`;
    // The fact text mentions the per-post source host so the bullet should survive.
    const factsText = 'CVE-2026-9999\nsources: https://niche-vendor-blog.example.co/advisory/123';
    const out = postProcess({ type: 'cve', raw, factsText });
    expect(out.body).toContain('niche-vendor-blog.example.co');
  });

  it('drops placeholder IPs / private addresses / TEST-NET / loopback from extracted IOCs', () => {
    const raw =
      `## What is this vulnerability?\n\n` +
      `CVE-2026-9999 talks to 192.168.1.100 and 10.0.0.1 internally, then beacons to 203.0.113.55 ` +
      `(the documentation example) and 127.0.0.1. A real C2 is 198.18.5.5 (benchmark range, not real). ` +
      `Real-world traffic was observed to 91.215.155.42 from this campaign.\n\n` +
      `## References\n\n- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-9999) - CVE record.\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-9999' });
    const ips = out.iocs.filter((i) => i.type === 'ipv4').map((i) => i.value);
    expect(ips).toContain('91.215.155.42');
    expect(ips).not.toContain('192.168.1.100');
    expect(ips).not.toContain('10.0.0.1');
    expect(ips).not.toContain('203.0.113.55');
    expect(ips).not.toContain('127.0.0.1');
    expect(ips).not.toContain('198.18.5.5');
  });

  it('drops obviously-fake hashes (all-same-char / cafebabe / etc.)', () => {
    const raw =
      `## Summary\n\nCVE-2026-9999 dropped these samples:\n` +
      `- deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef (fake)\n` +
      `- 0000000000000000000000000000000000000000000000000000000000000000 (placeholder)\n` +
      `- cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe (fake)\n` +
      `- 11ab22cd33ef44567890abcdef1234567890abcdef1234567890abcdef123456 (real-looking)\n\n` +
      `## References\n\n- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-9999) - CVE record.\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-9999' });
    const hashes = out.iocs.filter((i) => i.type === 'sha256').map((i) => i.value);
    expect(hashes).toContain('11ab22cd33ef44567890abcdef1234567890abcdef1234567890abcdef123456');
    expect(hashes).not.toContain('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(hashes).not.toContain('0000000000000000000000000000000000000000000000000000000000000000');
    expect(hashes).not.toContain('cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe');
  });

  it('drops placeholder domains (example.*, .local, .invalid)', () => {
    const raw =
      `## Summary\n\nCVE-2026-9999 was seen calling out to evil-real.example as a stand-in plus ` +
      `bad-corp.test for testing. The real C2 host is bad-actor-domain.xyz which the campaign uses.\n\n` +
      `## References\n\n- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-9999) - CVE record.\n`;
    const out = postProcess({ type: 'cve', raw, factsText: 'CVE-2026-9999' });
    const domains = out.iocs.filter((i) => i.type === 'domain').map((i) => i.value);
    expect(domains).toContain('bad-actor-domain.xyz');
    expect(domains).not.toContain('evil-real.example');
    expect(domains).not.toContain('bad-corp.test');
  });
});

describe('linkifyPlainTextRefs + unlinked reference QA', () => {
  it('linkifies numbered "1. BleepingComputer, ..." refs into clickable links', () => {
    const raw =
      `## What is this vulnerability?

Text.

` +
      `## Affected products

Text.

` +
      `## CVSS score breakdown

Text.

` +
      `## How the attack works

Text.

` +
      `## Why this matters

Text.

` +
      `## Indicators of compromise

Text.

` +
      `## Detection & mitigation

Text.

` +
      `## References

` +
      `1. BleepingComputer, initial breach disclosure with record count estimate.
` +
      `2. The Hacker News, follow‑up article confirming credit‑card exposure.
`;
    const out = postProcess({ type: 'intel', raw, factsText: '{}' });
    // Both publishers are in KNOWN_PUBLISHER_URLS so both get linkified.
    expect(out.body).toMatch(/\[BleepingComputer[^\]]+\]\(https:\/\/www\.bleepingcomputer\.com\/news\/security\/\)/);
    expect(out.body).toMatch(/\[The Hacker News[^\]]+\]\(https:\/\/thehackernews\.com\/\)/);
  });

  it('linkifies bulleted "- Krebs on Security, ..." refs into clickable links', () => {
    const raw =
      `## Summary

Text.

` +
      `## Detection & mitigation

Text.

` +
      `## References

` +
      `- Krebs on Security, exclusive interview with the lead investigator.
` +
      `- CISA KEV, the new entry added today.
`;
    const out = postProcess({ type: 'intel', raw, factsText: '{}' });
    expect(out.body).toMatch(/\[Krebs on Security[^\]]+\]\(https:\/\/krebsonsecurity\.com\/\)/);
    expect(out.body).toMatch(/\[CISA KEV[^\]]+\]\(https:\/\/www\.cisa\.gov\/known-exploited-vulnerabilities-catalog\)/);
  });

  it('leaves unrecognised publisher labels plain and flags the draft as QA-failed', () => {
    const raw =
      `## Summary

Text.

` +
      `## Detection & mitigation

Text.

` +
      `## References

` +
      `- Some Unknown Trade Rag, brief mention of the incident.
` +
      `- Another Mystery Outlet, follow‑up coverage with screenshots.
`;
    const out = postProcess({ type: 'intel', raw, factsText: '{}' });
    // No linkification happened — labels stay plain text.
    expect(out.body).not.toMatch(/\[Some Unknown Trade Rag[^\]]+\]\(http/);
    // QA gate catches the unlinked bullets: 2/2 unlinked is a clear
    // majority, so the majority-rule threshold still trips QA.
    expect(out.qa?.passed).toBe(false);
    expect(out.qa?.issues.join('|')).toMatch(/2\/2 reference bullets? have no URL/i);
  });

  it('accepts drafts where every References bullet is a proper markdown link', () => {
    const raw =
      `## Summary

Text.

` +
      `## Detection & mitigation

Text.

` +
      `## References

` +
      `- [BleepingComputer](https://www.bleepingcomputer.com/news/security/example)
` +
      `- [The Hacker News](https://thehackernews.com/2026/06/example.html)
`;
    const out = postProcess({ type: 'intel', raw, factsText: '{}' });
    expect(out.qa?.issues.join('|')).not.toMatch(/reference bullet.*no URL/i);
  });

  it('mixed bullet (one linked, one unlinked) no longer fails QA under the majority rule', () => {
    // The linkify map is conservative — a real-but-unrecognised publisher
    // shouldn't block the post. The QA gate now only trips when MAJORITY
    // of bullets are unlinked, reflecting "the model can't cite" rather
    // than "the model cited one novel source". 1/2 is not a majority.
    const raw =
      `## Summary

Text.

` +
      `## Detection & mitigation

Text.

` +
      `## References

` +
      `- [BleepingComputer](https://www.bleepingcomputer.com/news/security/example)
` +
      `- Some Unknown Trade Rag, brief mention.
`;
    const out = postProcess({ type: 'intel', raw, factsText: '{}' });
    expect(out.qa?.issues.join('|')).not.toMatch(/reference bullet/i);
  });

  it('three unlinked out of four bullets is a majority and fails QA', () => {
    const raw =
      `## Summary

Text.

` +
      `## Detection & mitigation

Text.

` +
      `## References

` +
      `- [BleepingComputer](https://www.bleepingcomputer.com/news/security/example)
` +
      `- Unknown A, brief mention.
` +
      `- Unknown B, another brief mention.
` +
      `- Unknown C, yet another brief mention.
`;
    const out = postProcess({ type: 'intel', raw, factsText: '{}' });
    expect(out.qa?.passed).toBe(false);
    expect(out.qa?.issues.join('|')).toMatch(/3\/4 reference bullets? have no URL/i);
  });
});
