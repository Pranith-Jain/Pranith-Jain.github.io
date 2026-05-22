/**
 * STIX 2.1 bundle builder.
 *
 * Given a feed item (or tool input) + extracted entities + bulk IoC
 * enrichments, emit:
 *   - `bundle`  — strict STIX 2.1 (spec_version, valid UUIDv5 IDs,
 *                 patterns per indicator type, relationships, identity,
 *                 marking-definition). Importable into OpenCTI / MISP /
 *                 any TAXII 2.1 client.
 *   - `view`    — denormalized, flat shape the frontend `<IntelCard>`
 *                 component renders without re-parsing the bundle.
 *
 * Deterministic IDs from `lib/uuidv5.ts` give every emitted object a
 * stable identity across re-runs and across feed items — the same IoC
 * value seen in two reports yields the same `indicator--<uuid>`.
 *
 * MITRE ATT&CK cross-reference: when an actor / malware / technique slug
 * matches an entry in `data/attack-id-index.ts`, an `external_references`
 * entry is added pointing back to attack.mitre.org and carrying the
 * canonical ATT&CK external_id (G####, S####, T####).
 */

import { stixId, uuidv5, NS_INTEL_BUNDLE } from './uuidv5';
import type { IndicatorType } from './indicator';
import { ATTACK_ID_INDEX } from '../data/attack-id-index';
import type { ExtractedActor, ExtractedCve, ExtractedEntities, ExtractedIoc, ExtractedMalware } from './extract';
import type { IocEnrichment, ProviderScore } from './enrich-bulk';
import type { CveEnrichment } from './cve-enrich';
import { EMPTY_LLM_ENTITIES, type LlmEntities } from './extract-llm';

export type Tlp = 'WHITE' | 'AMBER';

// Official OASIS TLP marking-definition UUIDs (publicly published). Using
// these makes the bundle importable into any STIX 2.1 consumer that
// honors the standard markings.
const TLP_MARKING_IDS: Record<Tlp, string> = {
  WHITE: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  AMBER: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
};

export interface ReportInput {
  /** Stable per-surface ID, e.g. 'briefings', 'rss:unit42.com'. */
  sourceId: string;
  /** Display name for the STIX `identity` object emitted for this source. */
  sourceName: string;
  /** Stable per-item identifier — URL preferred; else hash of (title|date). */
  itemRef: string;
  title: string;
  body: string;
  url?: string;
  publishedAt?: string | null;
  tlp: Tlp;
}

// ---------- STIX object types ----------

export interface StixCommon {
  type: string;
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  [k: string]: unknown;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixCommon[];
}

// ---------- Denormalized view (what the card reads) ----------

export interface IntelView {
  reportId: string;
  bundleId: string;
  title: string;
  source: { id: string; name: string; url?: string };
  publishedAt: string | null;
  summary: string;
  keywords: string[];
  threatActors: { name: string; aliases: string[]; mitreId?: string }[];
  malware: { name: string; aliases: string[]; mitreId?: string }[];
  cves: {
    id: string;
    /** Listed in CISA Known Exploited Vulnerabilities — active in-the-wild exploitation. */
    kevListed?: boolean;
    kevDateAdded?: string;
    kevDueDate?: string;
    /** FIRST EPSS — probability of exploitation in next 30 days, 0.0–1.0. */
    epssScore?: number;
    /** EPSS percentile, 0.0–1.0. */
    epssPercentile?: number;
  }[];
  iocs: {
    type: IndicatorType;
    value: string;
    confidence: number;
    riskScore: number;
    tags: string[];
    listedIn: string[];
    verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
    /** Per-provider scores for verdict provenance (UI hover/expand).
     *  Sorted by score desc; ok-status providers only. */
    providerScores: ProviderScore[];
  }[];
  iocsOverflow: { type: IndicatorType; value: string }[];
  attackPatterns: { name: string; mitreId: string }[];
  /** LLM-extracted sectors / industries (canonical-slug form). Populated only on the cron-warm path. */
  sectors: string[];
  /** LLM-extracted affected products. */
  affectedProducts: { vendor: string; product: string }[];
  /** Candidate actors from the LLM extractor — never promoted into `threatActors[]`. */
  actorCandidates: { name: string; rationale: string }[];
  /** Candidate malware from the LLM extractor — never promoted into `malware[]`. */
  malwareCandidates: { name: string; rationale: string }[];
  /** LLM-call provenance for analyst introspection. */
  llmEnrichment: { ran: boolean; partial: boolean; modelUsed?: string };
  tlp: Tlp;
  partial: boolean;
  generatedAt: string;
  extractedHash: string;
}

export interface BuildResult {
  bundle: StixBundle;
  view: IntelView;
}

// ---------- Helpers ----------

function nowIso(): string {
  return new Date().toISOString();
}

/** Stable across the whole bundle so every object reads the same timestamp. */
function timeFields(t: string) {
  return { created: t, modified: t };
}

/** STIX pattern fragment per IoC type. */
function patternFor(type: IndicatorType, value: string): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  switch (type) {
    case 'ipv4':
      return `[ipv4-addr:value = '${esc}']`;
    case 'ipv6':
      return `[ipv6-addr:value = '${esc}']`;
    case 'domain':
      return `[domain-name:value = '${esc}']`;
    case 'url':
      return `[url:value = '${esc}']`;
    case 'email':
      return `[email-addr:value = '${esc}']`;
    case 'hash': {
      const kind = detectHashKind(value);
      // STIX 2.1 file hash property names: MD5 / SHA-1 / SHA-256 / SHA-512.
      return `[file:hashes.'${kind}' = '${esc}']`;
    }
    default:
      // Fallback — shouldn't happen because extractor filters 'unknown'.
      return `[x-portfolio-unknown:value = '${esc}']`;
  }
}

/**
 * Map free-form provider tags to STIX 2.1's indicator-type-ov controlled
 * vocabulary plus the small set of always-useful labels (`attribution`,
 * `anonymization`). Raw provider tags still ride in `x_tags` for round-
 * tripping; this returns only OV-compliant entries that strict STIX
 * consumers (MISP/OpenCTI) treat as canonical.
 *
 * The base label is always derived from the composite verdict so even an
 * indicator with no tags emits at least one well-formed label.
 */
function mapTagsToStixLabels(tags: string[], verdict: IocEnrichment['verdict']): string[] {
  const labels = new Set<string>();
  // Verdict floor — every indicator gets a base OV label.
  if (verdict === 'malicious') labels.add('malicious-activity');
  else if (verdict === 'suspicious') labels.add('anomalous-activity');
  else if (verdict === 'clean') labels.add('benign');
  // (verdict === 'unknown' → no floor; relies on tag-mapping below.)

  for (const raw of tags) {
    const t = raw.toLowerCase().trim();
    if (!t) continue;
    if (t === 'known-good' || t === 'benign' || t === 'whitelist' || t.startsWith('src:nsrl')) {
      labels.add('benign');
    }
    if (
      t === 'tor' ||
      t === 'tor-exit-node' ||
      t === 'anonymization' ||
      t === 'proxy' ||
      t === 'vpn' ||
      t === 'anonymizer'
    ) {
      labels.add('anonymization');
    }
    if (t === 'compromised' || t === 'compromised-host' || t === 'compromised-server') {
      labels.add('compromised');
    }
    if (
      t === 'apt' ||
      t === 'attribution' ||
      t.startsWith('actor:') ||
      t.startsWith('apt-') ||
      t.startsWith('group:')
    ) {
      labels.add('attribution');
    }
    if (
      t === 'phishing' ||
      t === 'c2' ||
      t === 'c&c' ||
      t === 'malware' ||
      t === 'botnet' ||
      t === 'ransomware' ||
      t === 'malicious' ||
      t === 'spam' ||
      t === 'scanning' ||
      t === 'bruteforce' ||
      t.endsWith('-malicious') ||
      t.startsWith('malware:') ||
      t.startsWith('phishing:') ||
      t.startsWith('botnet:') ||
      t.startsWith('ransomware:') ||
      t.includes('-c2')
    ) {
      labels.add('malicious-activity');
    }
  }
  return [...labels];
}

function detectHashKind(value: string): 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512' {
  switch (value.length) {
    case 32:
      return 'MD5';
    case 40:
      return 'SHA-1';
    case 64:
      return 'SHA-256';
    case 128:
      return 'SHA-512';
    default:
      // Default to SHA-256 — the extractor already filters out non-hex
      // strings, so this is best-effort for off-length matches.
      return 'SHA-256';
  }
}

function attackExternalRefFor(externalId: string | undefined, type: 'group' | 'software' | 'technique') {
  if (!externalId) return null;
  if (!ATTACK_ID_INDEX[externalId]) return null;
  const path = type === 'group' ? 'groups' : type === 'software' ? 'software' : 'techniques';
  return {
    source_name: 'mitre-attack',
    external_id: externalId,
    url: `https://attack.mitre.org/${path}/${externalId}/`,
  };
}

/** Concatenate the extraction inputs into a stable hash for diff detection. */
async function extractedHash(report: ReportInput, e: ExtractedEntities): Promise<string> {
  const parts = [
    report.sourceId,
    report.itemRef,
    e.actors
      .map((a) => a.slug)
      .sort()
      .join(','),
    e.malware
      .map((m) => m.slug)
      .sort()
      .join(','),
    e.cves
      .map((c) => c.id)
      .sort()
      .join(','),
    e.iocs
      .map((i) => `${i.type}:${i.value.toLowerCase()}`)
      .sort()
      .join(','),
    e.tags.sort().join(','),
  ];
  const buf = new TextEncoder().encode(parts.join('|'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let hex = '';
  for (let i = 0; i < digest.length; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return hex;
}

/** Find an enrichment by (type, value); returns a zeroed default if absent. */
function enrichmentFor(enrichments: IocEnrichment[], ioc: ExtractedIoc): IocEnrichment {
  const hit = enrichments.find((e) => e.type === ioc.type && e.value.toLowerCase() === ioc.value.toLowerCase());
  if (hit) return hit;
  return {
    type: ioc.type,
    value: ioc.value,
    riskScore: 0,
    confidence: 50,
    tags: [],
    listedIn: [],
    verdict: 'unknown',
    contributing: 0,
    providerScores: [],
  };
}

// ---------- Builder ----------

export async function buildStixBundle(
  report: ReportInput,
  entities: ExtractedEntities,
  bulk: { enrichments: IocEnrichment[]; partial: boolean; overflow: { type: IndicatorType; value: string }[] },
  cveEnrichments: Map<string, CveEnrichment> = new Map(),
  llmEntities: LlmEntities = EMPTY_LLM_ENTITIES
): Promise<BuildResult> {
  const t = nowIso();

  // Identity (the source feed).
  const identityId = await stixId('identity', `identity|${report.sourceId}`);
  const identity: StixCommon = {
    type: 'identity',
    spec_version: '2.1',
    id: identityId,
    ...timeFields(t),
    name: report.sourceName,
    identity_class: 'organization',
  };

  // Threat actors.
  const actorObjs: StixCommon[] = await Promise.all(
    entities.actors.map(async (a: ExtractedActor) => {
      const id = await stixId('threat-actor', `threat-actor|${a.slug}`);
      const obj: StixCommon = {
        type: 'threat-actor',
        spec_version: '2.1',
        id,
        ...timeFields(t),
        name: a.canonical,
        aliases: a.aliases,
        created_by_ref: identityId,
      };
      const ref = attackExternalRefFor(a.mitreId, 'group');
      if (ref) obj.external_references = [ref];
      return obj;
    })
  );
  const actorIdBySlug = new Map(entities.actors.map((a, i) => [a.slug, actorObjs[i]!.id]));

  // Malware.
  const malwareObjs: StixCommon[] = await Promise.all(
    entities.malware.map(async (m: ExtractedMalware) => {
      const id = await stixId('malware', `malware|${m.slug}`);
      const obj: StixCommon = {
        type: 'malware',
        spec_version: '2.1',
        id,
        ...timeFields(t),
        name: m.canonical,
        aliases: m.aliases,
        is_family: true,
        created_by_ref: identityId,
      };
      const ref = attackExternalRefFor(m.mitreId, 'software');
      if (ref) obj.external_references = [ref];
      return obj;
    })
  );
  const malwareIdBySlug = new Map(entities.malware.map((m, i) => [m.slug, malwareObjs[i]!.id]));

  // Vulnerabilities (CVEs).
  const cveObjs: StixCommon[] = await Promise.all(
    entities.cves.map(async (c: ExtractedCve) => {
      const upper = c.id.toUpperCase();
      const id = await stixId('vulnerability', `vulnerability|${upper}`);
      const enrich = cveEnrichments.get(upper);
      const externalReferences: Array<Record<string, unknown>> = [
        {
          source_name: 'cve',
          external_id: upper,
          url: `https://nvd.nist.gov/vuln/detail/${upper}`,
        },
      ];
      // CISA KEV gets its own external_reference so strict STIX consumers
      // (MISP/OpenCTI) can surface the catalog link without parsing our
      // x_ fields. The x_ fields carry the structured data the frontend
      // needs without forcing the STIX consumer to know about KEV.
      if (enrich?.kevListed && enrich.kevDateAdded) {
        externalReferences.push({
          source_name: 'cisa-kev',
          description: `Added to KEV ${enrich.kevDateAdded}`,
          url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?cve=${upper}`,
        });
      }
      const obj: StixCommon = {
        type: 'vulnerability',
        spec_version: '2.1',
        id,
        ...timeFields(t),
        name: upper,
        external_references: externalReferences,
        created_by_ref: identityId,
      };
      if (enrich?.kevListed) {
        obj.x_kev_listed = true;
        if (enrich.kevDateAdded) obj.x_kev_date_added = enrich.kevDateAdded;
        if (enrich.kevDueDate) obj.x_kev_due_date = enrich.kevDueDate;
        if (enrich.kevRequiredAction) obj.x_kev_required_action = enrich.kevRequiredAction;
      }
      if (enrich?.epssScore !== undefined) {
        obj.x_epss_score = enrich.epssScore;
      }
      if (enrich?.epssPercentile !== undefined) {
        obj.x_epss_percentile = enrich.epssPercentile;
      }
      return obj;
    })
  );
  const cveIdByName = new Map(entities.cves.map((c, i) => [c.id.toUpperCase(), cveObjs[i]!.id]));

  // Attack patterns (LLM-extracted, allowlist-validated upstream by validateLlmEntities).
  const attackPatternObjs: StixCommon[] = await Promise.all(
    llmEntities.attackPatterns.map(async (ap) => {
      const id = await stixId('attack-pattern', `attack-pattern|${ap.id}`);
      return {
        type: 'attack-pattern',
        spec_version: '2.1',
        id,
        ...timeFields(t),
        name: ap.name || ap.id,
        external_references: [
          {
            source_name: 'mitre-attack',
            external_id: ap.id,
            url: `https://attack.mitre.org/techniques/${ap.id.replace('.', '/')}/`,
          },
        ],
        created_by_ref: identityId,
      } as StixCommon;
    })
  );

  // Indicators (IoCs + bulk enrichments).
  const indicatorObjs: StixCommon[] = await Promise.all(
    entities.iocs.map(async (ioc: ExtractedIoc) => {
      const enrich = enrichmentFor(bulk.enrichments, ioc);
      const id = await stixId('indicator', `indicator|${ioc.type}|${ioc.value.toLowerCase()}`);
      const obj: StixCommon = {
        type: 'indicator',
        spec_version: '2.1',
        id,
        ...timeFields(t),
        pattern_type: 'stix',
        pattern: patternFor(ioc.type, ioc.value),
        valid_from: t,
        indicator_types:
          enrich.verdict === 'malicious'
            ? ['malicious-activity']
            : enrich.verdict === 'suspicious'
              ? ['anomalous-activity']
              : ['benign'],
        // `labels` is now an OV-compliant subset (indicator-type-ov +
        // attribution/anonymization). Raw provider tags ride in `x_tags`
        // for round-tripping back to the analyst-facing UI.
        labels: mapTagsToStixLabels(enrich.tags, enrich.verdict),
        confidence: enrich.confidence,
        x_tags: enrich.tags,
        x_risk_score: enrich.riskScore,
        x_provider_listings: enrich.listedIn,
        x_provider_scores: enrich.providerScores,
        x_provider_verdict: enrich.verdict,
        x_ioc_type: ioc.type,
        x_ioc_value: ioc.value,
        created_by_ref: identityId,
      };
      return obj;
    })
  );
  const indicatorIdByKey = new Map(
    entities.iocs.map((i, idx) => [`${i.type}|${i.value.toLowerCase()}`, indicatorObjs[idx]!.id])
  );

  // Report — references every other object.
  const reportRefId = await stixId('report', `report|${report.sourceId}|${report.itemRef}`);
  const object_refs: string[] = [
    identityId,
    ...actorObjs.map((o) => o.id),
    ...malwareObjs.map((o) => o.id),
    ...cveObjs.map((o) => o.id),
    ...attackPatternObjs.map((o) => o.id),
    ...indicatorObjs.map((o) => o.id),
  ];

  // Relationships:
  //   report   -refers-to-> {actor | malware | cve | indicator}
  //   actor    -uses-> malware  (when both present in same report)
  //   indicator -indicates-> malware (when indicator's enrichment tagged it)
  const relationships: StixCommon[] = [];

  async function rel(sourceRef: string, type: string, targetRef: string) {
    const id = await stixId('relationship', `relationship|${sourceRef}|${type}|${targetRef}`);
    relationships.push({
      type: 'relationship',
      spec_version: '2.1',
      id,
      ...timeFields(t),
      relationship_type: type,
      source_ref: sourceRef,
      target_ref: targetRef,
      created_by_ref: identityId,
    });
  }

  // report → refers-to → everything
  for (const ref of object_refs) {
    if (ref === identityId) continue; // identity is the author, not a referenced topic
    await rel(reportRefId, 'refers-to', ref);
  }

  // actor → uses → malware (cross product when both present)
  for (const a of entities.actors) {
    for (const m of entities.malware) {
      const src = actorIdBySlug.get(a.slug);
      const tgt = malwareIdBySlug.get(m.slug);
      if (src && tgt) await rel(src, 'uses', tgt);
    }
  }

  // report → uses → attack-pattern (separate from refers-to so consumers can
  // distinguish "this report talks about X" from "this report says X was used").
  for (const ap of attackPatternObjs) {
    await rel(reportRefId, 'uses', ap.id);
  }

  // indicator → indicates → malware (when the IoC's tags carry a known family)
  for (const ioc of entities.iocs) {
    const enrich = enrichmentFor(bulk.enrichments, ioc);
    if (!enrich.tags.length) continue;
    const indicatorId = indicatorIdByKey.get(`${ioc.type}|${ioc.value.toLowerCase()}`);
    if (!indicatorId) continue;
    for (const m of entities.malware) {
      const slugMatches = enrich.tags.some(
        (tag) => tag.toLowerCase().includes(m.slug) || tag.toLowerCase().includes(m.canonical.toLowerCase())
      );
      if (!slugMatches) continue;
      const malwareId = malwareIdBySlug.get(m.slug);
      if (malwareId) await rel(indicatorId, 'indicates', malwareId);
    }
  }

  const reportObj: StixCommon = {
    type: 'report',
    spec_version: '2.1',
    id: reportRefId,
    ...timeFields(t),
    name: report.title,
    description: report.body,
    published: report.publishedAt ?? t,
    report_types: ['threat-report'],
    object_refs: [...object_refs, ...relationships.map((r) => r.id)],
    object_marking_refs: [TLP_MARKING_IDS[report.tlp]],
    external_references: report.url ? [{ source_name: report.sourceId, url: report.url }] : undefined,
    x_sectors: llmEntities.sectors.map((s) => s.name),
    x_affected_products: llmEntities.affectedProducts.map((p) => ({
      vendor: p.vendor,
      product: p.product,
    })),
    x_llm_actor_candidates: llmEntities.actorCandidates.map((c) => ({
      name: c.name,
      rationale: c.rationale,
    })),
    x_llm_malware_candidates: llmEntities.malwareCandidates.map((c) => ({
      name: c.name,
      rationale: c.rationale,
    })),
    x_llm_enrichment: {
      ran: llmEntities.ran,
      partial: llmEntities.partial,
      modelUsed: llmEntities.modelUsed,
    },
    labels: entities.tags,
    created_by_ref: identityId,
  };

  // Bundle id derived from same input as report id so the link is stable.
  const bundleId = `bundle--${await uuidv5(`bundle|${report.sourceId}|${report.itemRef}`, NS_INTEL_BUNDLE)}`;
  const bundle: StixBundle = {
    type: 'bundle',
    id: bundleId,
    objects: [
      identity,
      reportObj,
      ...actorObjs,
      ...malwareObjs,
      ...cveObjs,
      ...attackPatternObjs,
      ...indicatorObjs,
      ...relationships,
    ],
  };

  // View — flat, frontend-friendly, references the canonical IDs.
  const view: IntelView = {
    reportId: reportRefId,
    bundleId,
    title: report.title,
    source: { id: report.sourceId, name: report.sourceName, url: report.url },
    publishedAt: report.publishedAt ?? null,
    summary: entities.summary,
    keywords: entities.tags,
    threatActors: entities.actors.map((a) => ({
      name: a.canonical,
      aliases: a.aliases,
      mitreId: a.mitreId,
    })),
    malware: entities.malware.map((m) => ({
      name: m.canonical,
      aliases: m.aliases,
      mitreId: m.mitreId,
    })),
    cves: entities.cves.map((c) => {
      const upper = c.id.toUpperCase();
      const e = cveEnrichments.get(upper);
      return {
        id: upper,
        kevListed: e?.kevListed ? true : undefined,
        kevDateAdded: e?.kevDateAdded,
        kevDueDate: e?.kevDueDate,
        epssScore: e?.epssScore,
        epssPercentile: e?.epssPercentile,
      };
    }),
    iocs: entities.iocs.map((ioc) => {
      const e = enrichmentFor(bulk.enrichments, ioc);
      return {
        type: ioc.type,
        value: ioc.value,
        confidence: e.confidence,
        riskScore: e.riskScore,
        tags: e.tags,
        listedIn: e.listedIn,
        verdict: e.verdict,
        providerScores: e.providerScores,
      };
    }),
    iocsOverflow: bulk.overflow,
    sectors: llmEntities.sectors.map((s) => s.name),
    affectedProducts: llmEntities.affectedProducts.map((p) => ({ vendor: p.vendor, product: p.product })),
    actorCandidates: llmEntities.actorCandidates.map((c) => ({ name: c.name, rationale: c.rationale })),
    malwareCandidates: llmEntities.malwareCandidates.map((c) => ({ name: c.name, rationale: c.rationale })),
    attackPatterns: llmEntities.attackPatterns.map((a) => ({ name: a.name, mitreId: a.id })),
    llmEnrichment: {
      ran: llmEntities.ran,
      partial: llmEntities.partial,
      modelUsed: llmEntities.modelUsed,
    },
    tlp: report.tlp,
    partial: bulk.partial,
    generatedAt: t,
    extractedHash: await extractedHash(report, entities),
  };
  // Suppress unused-variable lint for the helper map (kept for future
  // attack-pattern wiring without re-deriving).
  void cveIdByName;

  return { bundle, view };
}
