/**
 * STIX 2.1 bundle parser.
 *
 * Parses a STIX 2.1 bundle into a structured `ParsedStix` shape that
 * covers ALL SDO/SRO types emitted by `stix-build.ts`:
 *   - identity, report, threat-actor, intrusion-set, malware,
 *     vulnerability, attack-pattern, indicator, tool, campaign,
 *     course-of-action, infrastructure, location, note, opinion,
 *     observed-data, malware-analysis
 *   - relationship, sighting (SROs)
 *   - marking-definition (TLP)
 *
 * Preserves custom x_ fields and external_references for round-tripping.
 */

// ---- Types ----------------------------------------------------------------

export interface StixIdentity {
  id: string;
  name: string;
  identity_class?: string;
  description?: string;
}

export interface StixActor {
  id: string;
  name: string;
  aliases: string[];
  motivation?: string;
  description?: string;
  /** ATT&CK group ID (G####). */
  mitre_id?: string;
  threat_actor_types?: string[];
  sophistication?: string;
  resource_level?: string;
  primary_motivation?: string;
  secondary_motivations?: string[];
  /** First seen in the wild. */
  first_seen?: string;
  /** Custom: sectors targeted. */
  x_sectors?: string[];
}

export interface StixMalware {
  id: string;
  name: string;
  aliases: string[];
  description?: string;
  is_family?: boolean;
  malware_types?: string[];
  /** ATT&CK software ID (S####). */
  mitre_id?: string;
  first_seen?: string;
  kill_chain_phases?: Array<{ kill_chain_name: string; phase_name: string }>;
}

export interface StixCampaign {
  id: string;
  name: string;
  description?: string;
  first_seen?: string;
  last_seen?: string;
  objective?: string;
  actor_id?: string;
}

export interface StixAttackPattern {
  id: string;
  name: string;
  description?: string;
  mitre_id?: string;
  kill_chain_phases?: Array<{ kill_chain_name: string; phase_name: string }>;
  x_mitre_platforms?: string[];
}

export interface StixIndicator {
  id: string;
  pattern: string;
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';
  value: string;
  labels: string[];
  confidence?: number;
  valid_from?: string;
  valid_until?: string;
  indicator_types?: string[];
  description?: string;
  /** Custom: per-provider enrichment scores. */
  x_provider_scores?: Array<{
    provider: string;
    score: number;
    status: 'ok' | 'error' | 'timeout';
  }>;
  x_tags?: string[];
  x_risk_score?: number;
  x_provider_verdict?: string;
}

export interface StixVulnerability {
  id: string;
  name: string;
  description?: string;
  external_references: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
    description?: string;
  }>;
  /** CISA KEV metadata. */
  x_kev_listed?: boolean;
  x_kev_date_added?: string;
  x_kev_due_date?: string;
  x_kev_required_action?: string;
  /** FIRST EPSS. */
  x_epss_score?: number;
  x_epss_percentile?: number;
  created_by_ref?: string;
}

export interface StixReport {
  id: string;
  name: string;
  description?: string;
  published?: string;
  report_types?: string[];
  object_refs?: string[];
  labels?: string[];
  external_references?: Array<{
    source_name: string;
    url?: string;
    external_id?: string;
  }>;
  /** Custom: sectors / affected products / LLM enrichment. */
  x_sectors?: string[];
  x_affected_products?: Array<{ vendor: string; product: string }>;
  x_llm_actor_candidates?: Array<{ name: string; rationale: string }>;
  x_llm_malware_candidates?: Array<{ name: string; rationale: string }>;
  x_llm_enrichment?: { ran: boolean; partial: boolean; modelUsed?: string };
  created_by_ref?: string;
  object_marking_refs?: string[];
}

export interface StixTool {
  id: string;
  name: string;
  description?: string;
  labels?: string[];
  tool_types?: string[];
  kill_chain_phases?: Array<{ kill_chain_name: string; phase_name: string }>;
  mitre_id?: string;
}

export interface StixCourseOfAction {
  id: string;
  name: string;
  description?: string;
  external_references?: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
  }>;
}

export interface StixInfrastructure {
  id: string;
  name: string;
  description?: string;
  infrastructure_types?: string[];
  kill_chain_phases?: Array<{ kill_chain_name: string; phase_name: string }>;
}

export interface StixLocation {
  id: string;
  name: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  region?: string;
}

export interface StixNote {
  id: string;
  abstract?: string;
  content?: string;
  object_refs?: string[];
  authors?: string[];
}

export interface StixOpinion {
  id: string;
  explanation?: string;
  opinion?: string;
  object_refs?: string[];
  authors?: string[];
}

export interface StixObservedData {
  id: string;
  first_observed?: string;
  last_observed?: string;
  number_observed?: number;
  object_refs?: string[];
}

export interface StixMalwareAnalysis {
  id: string;
  product?: string;
  version?: string;
  result?: string;
  malware_ref?: string;
}

export interface StixMarkingDefinition {
  id: string;
  definition_type?: string;
  definition?: Record<string, unknown>;
  name?: string;
}

export interface StixRelationship {
  id: string;
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  description?: string;
  created?: string;
}

export interface StixSighting {
  id: string;
  sighting_of_ref: string;
  where_sighted_refs?: string[];
  observed_data_refs?: string[];
  count?: number;
  description?: string;
  first_seen?: string;
  last_seen?: string;
}

export interface ParsedStix {
  identities: StixIdentity[];
  actors: StixActor[];
  malware: StixMalware[];
  campaigns: StixCampaign[];
  attack_patterns: StixAttackPattern[];
  indicators: StixIndicator[];
  vulnerabilities: StixVulnerability[];
  reports: StixReport[];
  tools: StixTool[];
  courses_of_action: StixCourseOfAction[];
  infrastructure: StixInfrastructure[];
  locations: StixLocation[];
  notes: StixNote[];
  opinions: StixOpinion[];
  observed_data: StixObservedData[];
  malware_analysis: StixMalwareAnalysis[];
  marking_definitions: StixMarkingDefinition[];
  relationships: StixRelationship[];
  sightings: StixSighting[];
  /** Aggregate stats by type. */
  stats: Record<string, number>;
}

// ---- Constants ------------------------------------------------------------

const PATTERN_RE = /^\[(?<obj>[a-z][a-z0-9-]*)(?::(?<prop>[^\s=]+))?\s*=\s*'(?<val>[^']+)'\s*\]$/i;
const MAX_OBJECTS = 1000;
const MAX_PATTERN_LENGTH = 2048;
// No supported indicator value (ipv4/ipv6/domain/url/hash/email) is plausibly
// this long; anything larger is treated as unknown rather than mis-typed.
const MAX_VALUE_LENGTH = 512;

// ---- Helpers --------------------------------------------------------------

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function strArr(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string');
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

interface StixObject {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface StixBundle {
  type: string;
  id?: string;
  spec_version?: string;
  objects?: StixObject[];
}

function parseExternalRefs(obj: StixObject): Array<{
  source_name: string;
  external_id?: string;
  url?: string;
  description?: string;
}> {
  return arr(obj.external_references).map((r) => {
    const o = r as Record<string, unknown>;
    return {
      source_name: str(o.source_name),
      external_id: typeof o.external_id === 'string' ? o.external_id : undefined,
      url: typeof o.url === 'string' ? o.url : undefined,
      description: typeof o.description === 'string' ? o.description : undefined,
    };
  });
}

function findMitreId(obj: StixObject): string | undefined {
  const refs = parseExternalRefs(obj);
  const mitre = refs.find((r) => r.source_name === 'mitre-attack');
  return mitre?.external_id;
}

function parseKillChain(obj: StixObject): Array<{ kill_chain_name: string; phase_name: string }> {
  return arr(obj.kill_chain_phases).map((kc) => {
    const o = kc as Record<string, string>;
    return { kill_chain_name: str(o.kill_chain_name), phase_name: str(o.phase_name) };
  });
}

// ---- Pattern parser -------------------------------------------------------

export function parseStixPattern(pattern: string): { type: StixIndicator['type']; value: string } {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return { type: 'unknown', value: '' };
  const m = pattern.trim().match(PATTERN_RE);
  if (!m || !m.groups) return { type: 'unknown', value: '' };
  const { obj, prop, val } = m.groups;
  const value = val ?? '';
  if (value.length > MAX_VALUE_LENGTH) return { type: 'unknown', value };
  if (obj === 'ipv4-addr') return { type: 'ipv4', value };
  if (obj === 'ipv6-addr') return { type: 'ipv6', value };
  if (obj === 'domain-name') return { type: 'domain', value };
  if (obj === 'url') return { type: 'url', value };
  if (obj === 'email-addr') return { type: 'email', value };
  if (obj === 'file' && prop?.startsWith('hashes')) return { type: 'hash', value };
  return { type: 'unknown', value };
}

// ---- Main parser ----------------------------------------------------------

export function parseStixBundle(bundle: StixBundle): ParsedStix {
  if (!bundle || bundle.type !== 'bundle') {
    throw new Error('not a STIX bundle');
  }
  const objs = bundle.objects ?? [];
  if (objs.length > MAX_OBJECTS) {
    throw new Error(`bundle too large: ${objs.length} objects (max ${MAX_OBJECTS})`);
  }

  const out: ParsedStix = {
    identities: [],
    actors: [],
    malware: [],
    campaigns: [],
    attack_patterns: [],
    indicators: [],
    vulnerabilities: [],
    reports: [],
    tools: [],
    courses_of_action: [],
    infrastructure: [],
    locations: [],
    notes: [],
    opinions: [],
    observed_data: [],
    malware_analysis: [],
    marking_definitions: [],
    relationships: [],
    sightings: [],
    stats: {},
  };

  // First pass: collect all objects by type.
  const relationships: StixRelationship[] = [];
  const sightings: StixSighting[] = [];

  for (const o of objs) {
    // Count stats for every type.
    out.stats[o.type] = (out.stats[o.type] ?? 0) + 1;

    switch (o.type) {
      case 'identity':
        out.identities.push({
          id: o.id,
          name: str(o.name),
          identity_class: typeof o.identity_class === 'string' ? o.identity_class : undefined,
          description: typeof o.description === 'string' ? o.description : undefined,
        });
        break;

      case 'threat-actor':
      case 'intrusion-set':
        out.actors.push({
          id: o.id,
          name: str(o.name),
          aliases: strArr(o.aliases),
          motivation: typeof o.primary_motivation === 'string' ? o.primary_motivation : undefined,
          description: typeof o.description === 'string' ? o.description : undefined,
          mitre_id: findMitreId(o),
          threat_actor_types: strArr(o.threat_actor_types),
          sophistication: typeof o.sophistication === 'string' ? o.sophistication : undefined,
          resource_level: typeof o.resource_level === 'string' ? o.resource_level : undefined,
          primary_motivation: typeof o.primary_motivation === 'string' ? o.primary_motivation : undefined,
          secondary_motivations: strArr(o.secondary_motivations),
          first_seen: typeof o.first_seen === 'string' ? o.first_seen : undefined,
          x_sectors: strArr(o.x_sectors),
        });
        break;

      case 'malware':
        out.malware.push({
          id: o.id,
          name: str(o.name),
          aliases: strArr(o.aliases),
          description: typeof o.description === 'string' ? o.description : undefined,
          is_family: bool(o.is_family),
          malware_types: strArr(o.malware_types),
          mitre_id: findMitreId(o),
          first_seen: typeof o.first_seen === 'string' ? o.first_seen : undefined,
          kill_chain_phases: parseKillChain(o),
        });
        break;

      case 'campaign':
        out.campaigns.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          first_seen: typeof o.first_seen === 'string' ? o.first_seen : undefined,
          last_seen: typeof o.last_seen === 'string' ? o.last_seen : undefined,
          objective: typeof o.objective === 'string' ? o.objective : undefined,
        });
        break;

      case 'attack-pattern':
        out.attack_patterns.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          mitre_id: findMitreId(o),
          kill_chain_phases: parseKillChain(o),
          x_mitre_platforms: strArr(o.x_mitre_platforms),
        });
        break;

      case 'indicator': {
        const pattern = str(o.pattern);
        const parsed = parseStixPattern(pattern);
        out.indicators.push({
          id: o.id,
          pattern,
          type: parsed.type,
          value: parsed.value,
          labels: strArr(o.labels),
          confidence: num(o.confidence),
          valid_from: typeof o.valid_from === 'string' ? o.valid_from : undefined,
          valid_until: typeof o.valid_until === 'string' ? o.valid_until : undefined,
          indicator_types: strArr(o.indicator_types),
          description: typeof o.description === 'string' ? o.description : undefined,
          x_provider_scores: Array.isArray(o.x_provider_scores)
            ? (o.x_provider_scores as StixIndicator['x_provider_scores'])
            : undefined,
          x_tags: strArr(o.x_tags),
          x_risk_score: num(o.x_risk_score),
          x_provider_verdict: typeof o.x_provider_verdict === 'string' ? o.x_provider_verdict : undefined,
        });
        break;
      }

      case 'vulnerability':
        out.vulnerabilities.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          external_references: parseExternalRefs(o),
          x_kev_listed: bool(o.x_kev_listed),
          x_kev_date_added: typeof o.x_kev_date_added === 'string' ? o.x_kev_date_added : undefined,
          x_kev_due_date: typeof o.x_kev_due_date === 'string' ? o.x_kev_due_date : undefined,
          x_kev_required_action: typeof o.x_kev_required_action === 'string' ? o.x_kev_required_action : undefined,
          x_epss_score: num(o.x_epss_score),
          x_epss_percentile: num(o.x_epss_percentile),
          created_by_ref: typeof o.created_by_ref === 'string' ? o.created_by_ref : undefined,
        });
        break;

      case 'report':
        out.reports.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          published: typeof o.published === 'string' ? o.published : undefined,
          report_types: strArr(o.report_types),
          object_refs: strArr(o.object_refs),
          labels: strArr(o.labels),
          external_references: parseExternalRefs(o),
          x_sectors: strArr(o.x_sectors),
          x_affected_products: Array.isArray(o.x_affected_products)
            ? (o.x_affected_products as StixReport['x_affected_products'])
            : undefined,
          x_llm_actor_candidates: Array.isArray(o.x_llm_actor_candidates)
            ? (o.x_llm_actor_candidates as StixReport['x_llm_actor_candidates'])
            : undefined,
          x_llm_malware_candidates: Array.isArray(o.x_llm_malware_candidates)
            ? (o.x_llm_malware_candidates as StixReport['x_llm_malware_candidates'])
            : undefined,
          x_llm_enrichment:
            typeof o.x_llm_enrichment === 'object' && o.x_llm_enrichment
              ? (o.x_llm_enrichment as StixReport['x_llm_enrichment'])
              : undefined,
          created_by_ref: typeof o.created_by_ref === 'string' ? o.created_by_ref : undefined,
          object_marking_refs: strArr(o.object_marking_refs),
        });
        break;

      case 'tool':
        out.tools.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          labels: strArr(o.labels),
          tool_types: strArr(o.tool_types),
          kill_chain_phases: parseKillChain(o),
          mitre_id: findMitreId(o),
        });
        break;

      case 'course-of-action':
        out.courses_of_action.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          external_references: parseExternalRefs(o),
        });
        break;

      case 'infrastructure':
        out.infrastructure.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          infrastructure_types: strArr(o.infrastructure_types),
          kill_chain_phases: parseKillChain(o),
        });
        break;

      case 'location':
        out.locations.push({
          id: o.id,
          name: str(o.name),
          description: typeof o.description === 'string' ? o.description : undefined,
          latitude: num(o.latitude),
          longitude: num(o.longitude),
          country: typeof o.country === 'string' ? o.country : undefined,
          region: typeof o.region === 'string' ? o.region : undefined,
        });
        break;

      case 'note':
        out.notes.push({
          id: o.id,
          abstract: typeof o.abstract === 'string' ? o.abstract : undefined,
          content: typeof o.content === 'string' ? o.content : undefined,
          object_refs: strArr(o.object_refs),
          authors: strArr(o.authors),
        });
        break;

      case 'opinion':
        out.opinions.push({
          id: o.id,
          explanation: typeof o.explanation === 'string' ? o.explanation : undefined,
          opinion: typeof o.opinion === 'string' ? o.opinion : undefined,
          object_refs: strArr(o.object_refs),
          authors: strArr(o.authors),
        });
        break;

      case 'observed-data':
        out.observed_data.push({
          id: o.id,
          first_observed: typeof o.first_observed === 'string' ? o.first_observed : undefined,
          last_observed: typeof o.last_observed === 'string' ? o.last_observed : undefined,
          number_observed: num(o.number_observed),
          object_refs: strArr(o.object_refs),
        });
        break;

      case 'malware-analysis':
        out.malware_analysis.push({
          id: o.id,
          product: typeof o.product === 'string' ? o.product : undefined,
          version: typeof o.version === 'string' ? o.version : undefined,
          result: typeof o.result === 'string' ? o.result : undefined,
          malware_ref: typeof o.malware_ref === 'string' ? o.malware_ref : undefined,
        });
        break;

      case 'marking-definition':
        out.marking_definitions.push({
          id: o.id,
          definition_type: typeof o.definition_type === 'string' ? o.definition_type : undefined,
          definition:
            typeof o.definition === 'object' && o.definition ? (o.definition as Record<string, unknown>) : undefined,
          name: typeof o.name === 'string' ? o.name : undefined,
        });
        break;

      case 'relationship':
        relationships.push({
          id: o.id,
          source_ref: str(o.source_ref),
          target_ref: str(o.target_ref),
          relationship_type: str(o.relationship_type),
          description: typeof o.description === 'string' ? o.description : undefined,
          created: typeof o.created === 'string' ? o.created : undefined,
        });
        break;

      case 'sighting':
        sightings.push({
          id: o.id,
          sighting_of_ref: str(o.sighting_of_ref),
          where_sighted_refs: strArr(o.where_sighted_refs),
          observed_data_refs: strArr(o.observed_data_refs),
          count: num(o.count),
          description: typeof o.description === 'string' ? o.description : undefined,
          first_seen: typeof o.first_seen === 'string' ? o.first_seen : undefined,
          last_seen: typeof o.last_seen === 'string' ? o.last_seen : undefined,
        });
        break;

      // Skip unknown SDO types gracefully.
      default:
        break;
    }
  }

  out.relationships = relationships;
  out.sightings = sightings;

  // Second pass: resolve relationship cross-references.
  const actorIds = new Set(out.actors.map((a) => a.id));

  for (const rel of relationships) {
    // campaign → attributed-to → actor
    if (rel.relationship_type === 'attributed-to') {
      const camp = out.campaigns.find((c) => c.id === rel.source_ref);
      if (camp && actorIds.has(rel.target_ref)) {
        camp.actor_id = rel.target_ref;
      }
    }
  }

  return out;
}
