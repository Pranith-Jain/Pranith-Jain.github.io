import { describe, it, expect } from 'vitest';
import { buildStixBundle, type ReportInput } from '../../src/lib/stix-build';
import { extract } from '../../src/lib/extract';
import type { IocEnrichment } from '../../src/lib/enrich-bulk';
import type { CveEnrichment } from '../../src/lib/cve-enrich';
import type { LlmEntities } from '../../src/lib/extract-llm';
import { EMPTY_LLM_ENTITIES } from '../../src/lib/extract-llm';

const APT28_BRIEF_BODY = `Microsoft Threat Intelligence Center (MSTIC) has observed APT28 (Fancy Bear/STRONTIUM) conducting spear-phishing campaigns targeting European government entities throughout Q4 2024. The campaigns leverage spoofed diplomatic communications and exploit CVE-2023-36884 to deliver a new variant of the CremShell malware. Second-wave attacks utilized compromised legitimate accounts, with escalation in December involving direct exploitation attempts against government networks.

Indicators:
  diplo-service.com
  https://cremshell-c2.xyz/api/report
  5d41402abc4b2a76b9719d911017c592`;

const TITLE = 'APT28 Targets European Government Entities';

const report: ReportInput = {
  sourceId: 'unit42',
  sourceName: 'Unit 42',
  itemRef: 'https://unit42.example/post/apt28-eu-gov',
  title: TITLE,
  body: APT28_BRIEF_BODY,
  url: 'https://unit42.example/post/apt28-eu-gov',
  publishedAt: '2026-01-15T00:00:00Z',
  tlp: 'WHITE',
};

const emptyBulk = {
  enrichments: [] as IocEnrichment[],
  partial: false,
  overflow: [] as { type: never; value: string }[],
};

describe('buildStixBundle (APT28 brief)', () => {
  it('emits a valid STIX 2.1 bundle envelope', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle(report, entities, emptyBulk);

    expect(bundle.type).toBe('bundle');
    expect(bundle.id).toMatch(/^bundle--[0-9a-f-]{36}$/);
    expect(Array.isArray(bundle.objects)).toBe(true);
    // identity + report + 1 actor + 1 malware + 2 cves + 3 indicators + relationships
    expect(bundle.objects.length).toBeGreaterThanOrEqual(8);
  });

  it('emits exactly one report and one identity for the source', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle(report, entities, emptyBulk);
    const reports = bundle.objects.filter((o) => o.type === 'report');
    const identities = bundle.objects.filter((o) => o.type === 'identity');
    expect(reports).toHaveLength(1);
    expect(identities).toHaveLength(1);
    expect((reports[0] as { name?: string }).name).toBe(TITLE);
    expect((identities[0] as { name?: string }).name).toBe('Unit 42');
  });

  it('emits APT28 with the canonical MITRE G0007 external_reference', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle(report, entities, emptyBulk);
    const actor = bundle.objects.find((o) => o.type === 'threat-actor' && (o as { name?: string }).name === 'APT28') as
      | { external_references?: { source_name?: string; external_id?: string; url?: string }[] }
      | undefined;
    expect(actor?.external_references?.[0]?.external_id).toBe('G0007');
    expect(actor?.external_references?.[0]?.source_name).toBe('mitre-attack');
  });

  it('emits indicators with valid STIX 2.1 patterns per type', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle(report, entities, emptyBulk);
    const indicators = bundle.objects.filter((o) => o.type === 'indicator') as {
      pattern?: string;
      x_ioc_type?: string;
    }[];
    const byType = (t: string) => indicators.find((i) => i.x_ioc_type === t)?.pattern ?? '';
    expect(byType('domain')).toMatch(/^\[domain-name:value = '[^']+'\]$/);
    expect(byType('url')).toMatch(/^\[url:value = '[^']+'\]$/);
    expect(byType('hash')).toMatch(/^\[file:hashes\.'(MD5|SHA-1|SHA-256|SHA-512)' = '[^']+'\]$/);
  });

  it('attaches the TLP marking-definition to the report', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle(report, entities, emptyBulk);
    const r = bundle.objects.find((o) => o.type === 'report') as { object_marking_refs?: string[] };
    expect(r.object_marking_refs).toContain('marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9');
  });

  it('switches the TLP marking when input requests AMBER', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle({ ...report, tlp: 'AMBER' }, entities, emptyBulk);
    const r = bundle.objects.find((o) => o.type === 'report') as { object_marking_refs?: string[] };
    expect(r.object_marking_refs).toContain('marking-definition--f88d31f6-486f-44da-b317-01333bde0b82');
  });

  it('emits an actor → uses → malware relationship', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { bundle } = await buildStixBundle(report, entities, emptyBulk);
    const actorId = (
      bundle.objects.find((o) => o.type === 'threat-actor' && (o as { name?: string }).name === 'APT28') as {
        id: string;
      }
    ).id;
    const malwareId = (
      bundle.objects.find((o) => o.type === 'malware' && (o as { name?: string }).name === 'CremShell') as {
        id: string;
      }
    ).id;
    const rel = bundle.objects.find(
      (o) =>
        o.type === 'relationship' &&
        (o as { source_ref?: string }).source_ref === actorId &&
        (o as { target_ref?: string }).target_ref === malwareId
    ) as { relationship_type?: string } | undefined;
    expect(rel?.relationship_type).toBe('uses');
  });

  it('is deterministic — identical input yields identical bundle.id, report.id, actor.id', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const a = await buildStixBundle(report, entities, emptyBulk);
    const b = await buildStixBundle(report, entities, emptyBulk);
    expect(a.bundle.id).toBe(b.bundle.id);
    const aReport = a.bundle.objects.find((o) => o.type === 'report')?.id;
    const bReport = b.bundle.objects.find((o) => o.type === 'report')?.id;
    expect(aReport).toBe(bReport);
    // Indicator IDs are derived from (type|value) only — same domain in two
    // unrelated reports must share the same indicator.id.
    const aInd = a.bundle.objects.find((o) => o.type === 'indicator')?.id;
    const bInd = b.bundle.objects.find((o) => o.type === 'indicator')?.id;
    expect(aInd).toBe(bInd);
  });

  it('view shape mirrors the screenshot — title, source, actors, malware, cves, iocs, keywords', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const { view } = await buildStixBundle(report, entities, emptyBulk);
    expect(view.title).toBe(TITLE);
    expect(view.source.name).toBe('Unit 42');
    expect(view.threatActors.map((a) => a.name)).toContain('APT28');
    expect(view.malware.map((m) => m.name)).toContain('CremShell');
    expect(view.cves.map((c) => c.id)).toContain('CVE-2023-36884');
    expect(view.keywords).toContain('spear-phishing');
    expect(view.iocs.length).toBeGreaterThanOrEqual(3);
    expect(view.tlp).toBe('WHITE');
  });

  it('handles an empty extraction without throwing — emits identity + report only', async () => {
    const entities = extract('', '');
    const { bundle, view } = await buildStixBundle(report, entities, emptyBulk);
    expect(bundle.objects.filter((o) => o.type === 'indicator')).toHaveLength(0);
    expect(bundle.objects.filter((o) => o.type === 'threat-actor')).toHaveLength(0);
    expect(bundle.objects.filter((o) => o.type === 'malware')).toHaveLength(0);
    expect(bundle.objects.filter((o) => o.type === 'report')).toHaveLength(1);
    expect(bundle.objects.filter((o) => o.type === 'identity')).toHaveLength(1);
    expect(view.iocs).toEqual([]);
  });

  it('extractedHash is deterministic and changes when entities change', async () => {
    const e1 = extract(TITLE, APT28_BRIEF_BODY);
    const e2 = extract(TITLE, APT28_BRIEF_BODY + '\nExtra IoC: 1.2.3.4');
    const a = await buildStixBundle(report, e1, emptyBulk);
    const b = await buildStixBundle(report, e1, emptyBulk);
    const c = await buildStixBundle(report, e2, emptyBulk);
    expect(a.view.extractedHash).toBe(b.view.extractedHash);
    expect(a.view.extractedHash).not.toBe(c.view.extractedHash);
  });

  describe('CVE enrichment (KEV + EPSS)', () => {
    it('attaches kevListed/x_kev_* + x_epss_* fields when supplied', async () => {
      const entities = extract(TITLE, APT28_BRIEF_BODY);
      const cveEnrichments = new Map<string, CveEnrichment>([
        [
          'CVE-2023-36884',
          {
            cveId: 'CVE-2023-36884',
            kevListed: true,
            kevDateAdded: '2023-07-17',
            kevDueDate: '2023-08-07',
            kevRequiredAction: 'Apply mitigations per vendor instructions',
            epssScore: 0.91234,
            epssPercentile: 0.99,
          },
        ],
      ]);
      const { bundle, view } = await buildStixBundle(report, entities, emptyBulk, cveEnrichments);
      const vuln = bundle.objects.find(
        (o) => o.type === 'vulnerability' && (o as { name?: string }).name === 'CVE-2023-36884'
      ) as Record<string, unknown> | undefined;
      expect(vuln?.x_kev_listed).toBe(true);
      expect(vuln?.x_kev_date_added).toBe('2023-07-17');
      expect(vuln?.x_epss_score).toBeCloseTo(0.91234, 4);
      // KEV adds a second external_reference alongside the existing CVE one.
      const refs = vuln?.external_references as Array<{ source_name?: string }> | undefined;
      expect(refs?.some((r) => r.source_name === 'cisa-kev')).toBe(true);
      // The denormalized view carries the same signals so the card can
      // render "Actively exploited (KEV)" without re-parsing the bundle.
      const c = view.cves.find((v) => v.id === 'CVE-2023-36884');
      expect(c?.kevListed).toBe(true);
      expect(c?.kevDateAdded).toBe('2023-07-17');
      expect(c?.epssScore).toBeCloseTo(0.91234, 4);
    });

    it('omits KEV/EPSS fields when enrichments are absent', async () => {
      const entities = extract(TITLE, APT28_BRIEF_BODY);
      const { bundle, view } = await buildStixBundle(report, entities, emptyBulk);
      const vuln = bundle.objects.find((o) => o.type === 'vulnerability') as Record<string, unknown> | undefined;
      expect(vuln?.x_kev_listed).toBeUndefined();
      expect(vuln?.x_epss_score).toBeUndefined();
      // External references should still contain the CVE link but not the KEV link.
      const refs = vuln?.external_references as Array<{ source_name?: string }> | undefined;
      expect(refs?.some((r) => r.source_name === 'cve')).toBe(true);
      expect(refs?.some((r) => r.source_name === 'cisa-kev')).toBe(false);
      // View carries the raw id only.
      const c = view.cves[0];
      expect(c?.kevListed).toBeUndefined();
    });
  });

  describe('tag → STIX labels mapping', () => {
    const enrichmentWithTags = (tags: string[], verdict: IocEnrichment['verdict']): IocEnrichment => ({
      type: 'domain',
      value: 'evil.example',
      riskScore: verdict === 'malicious' ? 90 : 0,
      confidence: 75,
      tags,
      listedIn: [],
      verdict,
      contributing: 2,
      providerScores: [],
    });

    it('emits OV-aligned labels (malicious-activity, attribution, anonymization) instead of raw tags', async () => {
      const entities = extract('Phishing landing', 'See evil.example for context.');
      const bulk = {
        enrichments: [enrichmentWithTags(['phishing', 'apt-28', 'tor-exit-node', 'urlhaus-malicious'], 'malicious')],
        partial: false,
        overflow: [] as { type: 'domain'; value: string }[],
      };
      const { bundle } = await buildStixBundle(report, entities, bulk);
      const ind = bundle.objects.find((o) => o.type === 'indicator') as
        | { labels?: string[]; x_tags?: string[] }
        | undefined;
      expect(ind?.labels).toContain('malicious-activity');
      expect(ind?.labels).toContain('attribution');
      expect(ind?.labels).toContain('anonymization');
      // The raw tags moved to x_tags — strict STIX consumers see only the OV.
      expect(ind?.x_tags).toEqual(['phishing', 'apt-28', 'tor-exit-node', 'urlhaus-malicious']);
      // No raw provider tag leaked into labels.
      expect(ind?.labels).not.toContain('urlhaus-malicious');
    });

    it('emits benign label for known-good (NSRL) hits', async () => {
      const entities = extract('Hash check', 'Reference hash 5d41402abc4b2a76b9719d911017c592.');
      const bulk = {
        enrichments: [
          {
            ...enrichmentWithTags(['known-good', 'src:nsrl'], 'clean'),
            type: 'hash' as const,
            value: '5d41402abc4b2a76b9719d911017c592',
          },
        ],
        partial: false,
        overflow: [] as { type: 'hash'; value: string }[],
      };
      const { bundle } = await buildStixBundle(report, entities, bulk);
      const ind = bundle.objects.find((o) => o.type === 'indicator') as { labels?: string[] } | undefined;
      expect(ind?.labels).toContain('benign');
      expect(ind?.labels).not.toContain('malicious-activity');
    });
  });

  it('view.iocs carries providerScores for verdict provenance', async () => {
    const entities = extract('Beacon', 'Domain evil.example was observed beaconing.');
    const bulk = {
      enrichments: [
        {
          type: 'domain' as const,
          value: 'evil.example',
          riskScore: 80,
          confidence: 75,
          tags: ['phishing'],
          listedIn: ['urlhaus' as const, 'threatfox' as const],
          verdict: 'malicious' as const,
          contributing: 2,
          providerScores: [
            { source: 'urlhaus' as const, score: 90, verdict: 'malicious' as const, tags: ['phishing'] },
            { source: 'threatfox' as const, score: 70, verdict: 'malicious' as const, tags: [] },
          ],
        },
      ],
      partial: false,
      overflow: [] as { type: 'domain'; value: string }[],
    };
    const { view } = await buildStixBundle(report, entities, bulk);
    const ioc = view.iocs.find((i) => i.value === 'evil.example');
    expect(ioc?.providerScores).toHaveLength(2);
    expect(ioc?.providerScores?.[0]?.source).toBe('urlhaus');
    expect(ioc?.providerScores?.[0]?.score).toBe(90);
  });
});

describe('buildStixBundle — LlmEntities support', () => {
  it('accepts the new llmEntities argument without breaking the existing call shape', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const r = await buildStixBundle(report, entities, emptyBulk, new Map(), EMPTY_LLM_ENTITIES);
    expect(r.bundle.type).toBe('bundle');
    expect(r.view.sectors).toEqual([]);
    expect(r.view.affectedProducts).toEqual([]);
    expect(r.view.actorCandidates).toEqual([]);
    expect(r.view.malwareCandidates).toEqual([]);
    expect(r.view.attackPatterns).toEqual([]);
    expect(r.view.llmEnrichment).toEqual({ ran: false, partial: false });
  });

  it('defaults llmEntities when called with 4 args (existing call sites)', async () => {
    const entities = extract(TITLE, APT28_BRIEF_BODY);
    const r = await buildStixBundle(report, entities, emptyBulk);
    expect(r.view.sectors).toEqual([]);
    expect(r.view.llmEnrichment).toEqual({ ran: false, partial: false });
  });
});
