/**
 * STIX 2.1 Bundle Import
 *
 * Parses STIX 2.1 bundles (from MISP, OpenCTI, or any TAXII server) and
 * extracts structured intelligence for storage in the platform's D1 database.
 *
 * Supported STIX object types:
 *   - indicator: IOC extraction (IP, domain, hash, URL, email)
 *   - threat-actor: Actor profiles and aliases
 *   - malware: Malware family information
 *   - attack-pattern: MITRE ATT&CK technique mapping
 *   - campaign: Campaign attribution and timeline
 *   - report: Intel report metadata and references
 *   - vulnerability: CVE mapping
 *   - relationship: Object linkage graph
 *
 * Usage:
 *   import { parseStixBundle, type StixParseResult } from '../lib/stix-import';
 *   const result = parseStixBundle(bundleJson);
 */

// ── STIX 2.1 Type Definitions ────────────────────────────────────

export interface StixObject {
  type: string;
  spec_version?: string;
  id: string;
  created: string;
  modified: string;
  name?: string;
  description?: string;
  pattern?: string;
  pattern_type?: string;
  valid_from?: string;
  kill_chain_phases?: Array<{ kill_chain_name: string; phase_name: string }>;
  aliases?: string[];
  roles?: string[];
  resource_level?: string;
  primary_motivation?: string;
  secondary_motivations?: string[];
  external_references?: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
    description?: string;
  }>;
  labels?: string[];
  created_by_ref?: string;
  object_marking_refs?: string[];
  // Malware-specific
  is_family?: boolean;
  malware_types?: string[];
  // Campaign-specific
  first_seen?: string;
  last_seen?: string;
  // Vulnerability-specific
  // (name is the CVE ID in STIX 2.1)
  // Relationship-specific
  relationship_type?: string;
  source_ref?: string;
  target_ref?: string;
  // Report-specific
  published?: string;
  object_refs?: string[];
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixObject[];
}

export interface ParsedIndicator {
  stixId: string;
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';
  value: string;
  pattern: string;
  validFrom?: string;
  labels: string[];
  description?: string;
  sourceRef?: string;
}

export interface ParsedActor {
  stixId: string;
  name: string;
  aliases: string[];
  description?: string;
  roles: string[];
  motivations: string[];
  externalRefs: Array<{ source: string; id?: string; url?: string }>;
}

export interface ParsedMalware {
  stixId: string;
  name: string;
  isFamily: boolean;
  malwareTypes: string[];
  description?: string;
  aliases: string[];
  externalRefs: Array<{ source: string; id?: string; url?: string }>;
}

export interface ParsedAttackPattern {
  stixId: string;
  name: string;
  description?: string;
  killChainPhases: Array<{ chain: string; phase: string }>;
  externalRefs: Array<{ source: string; id?: string; url?: string }>;
}

export interface ParsedVulnerability {
  stixId: string;
  name: string; // CVE ID
  description?: string;
  externalRefs: Array<{ source: string; id?: string; url?: string }>;
}

export interface ParsedRelationship {
  stixId: string;
  type: string;
  sourceRef: string;
  targetRef: string;
  description?: string;
}

export interface ParsedCampaign {
  stixId: string;
  name: string;
  description?: string;
  firstSeen?: string;
  lastSeen?: string;
  aliases: string[];
  externalRefs: Array<{ source: string; id?: string; url?: string }>;
}

export interface ParsedReport {
  stixId: string;
  name: string;
  description?: string;
  published?: string;
  labels: string[];
  objectRefs: string[];
  externalRefs: Array<{ source: string; id?: string; url?: string }>;
}

export interface StixParseResult {
  valid: boolean;
  errors: string[];
  indicators: ParsedIndicator[];
  actors: ParsedActor[];
  malware: ParsedMalware[];
  attackPatterns: ParsedAttackPattern[];
  vulnerabilities: ParsedVulnerability[];
  relationships: ParsedRelationship[];
  campaigns: ParsedCampaign[];
  reports: ParsedReport[];
  stats: {
    totalObjects: number;
    byType: Record<string, number>;
  };
}

// ── Pattern Parsing ──────────────────────────────────────────────

/**
 * Extract the indicator value from a STIX 2.1 pattern string.
 *
 * STIX patterns look like:
 *   [ipv4-addr:value = '1.2.3.4']
 *   [domain-name:value = 'evil.com']
 *   [file:hashes.'SHA-256' = 'abc123']
 *   [url:value = 'http://evil.com/path']
 *   [email-addr:value = 'bad@evil.com']
 */
function extractFromPattern(pattern: string): { type: ParsedIndicator['type']; value: string } {
  const cleaned = pattern.replace(/[[\]]/g, '').trim();

  // IPv4: ipv4-addr:value = '...'
  const ipv4 = /ipv4-addr:value\s*=\s*'([^']+)'/i.exec(cleaned);
  if (ipv4?.[1]) return { type: 'ipv4', value: ipv4[1] };

  // IPv6: ipv6-addr:value = '...'
  const ipv6 = /ipv6-addr:value\s*=\s*'([^']+)'/i.exec(cleaned);
  if (ipv6?.[1]) return { type: 'ipv6', value: ipv6[1] };

  // Domain: domain-name:value = '...'
  const domain = /domain-name:value\s*=\s*'([^']+)'/i.exec(cleaned);
  if (domain?.[1]) return { type: 'domain', value: domain[1] };

  // URL: url:value = '...'
  const url = /url:value\s*=\s*'([^']+)'/i.exec(cleaned);
  if (url?.[1]) return { type: 'url', value: url[1] };

  // Email: email-addr:value = '...'
  const email = /email-addr:value\s*=\s*'([^']+)'/i.exec(cleaned);
  if (email?.[1]) return { type: 'email', value: email[1] };

  // Hash: file:hashes.'ALGORITHM' = '...'
  const hash = /file:hashes\.'(?:SHA-?256|SHA-?1|MD5|SHA-?512)'\s*=\s*'([^']+)'/i.exec(cleaned);
  if (hash?.[1]) return { type: 'hash', value: hash[1].toLowerCase() };

  // Fallback: try to extract any quoted value
  const fallback = /=\s*'([^']+)'/.exec(cleaned);
  if (fallback?.[1]) return { type: 'unknown', value: fallback[1] };

  return { type: 'unknown', value: '' };
}

// ── External References Extractor ────────────────────────────────

function extractExternalRefs(obj: StixObject): Array<{ source: string; id?: string; url?: string }> {
  return (obj.external_references ?? []).map((ref) => ({
    source: ref.source_name ?? 'unknown',
    id: ref.external_id,
    url: ref.url,
  }));
}

// ── Main Parser ──────────────────────────────────────────────────

/**
 * Parse a STIX 2.1 bundle and extract structured intelligence.
 *
 * @param bundleJson - Raw JSON string or parsed STIX bundle
 * @returns Structured parse result with all object types separated
 */
export function parseStixBundle(bundleJson: string | StixBundle): StixParseResult {
  const result: StixParseResult = {
    valid: false,
    errors: [],
    indicators: [],
    actors: [],
    malware: [],
    attackPatterns: [],
    vulnerabilities: [],
    relationships: [],
    campaigns: [],
    reports: [],
    stats: { totalObjects: 0, byType: {} },
  };

  // Parse JSON if needed.
  let bundle: StixBundle;
  if (typeof bundleJson === 'string') {
    try {
      bundle = JSON.parse(bundleJson) as StixBundle;
    } catch (e) {
      result.errors.push(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`);
      return result;
    }
  } else {
    bundle = bundleJson;
  }

  // Validate bundle structure.
  if (bundle.type !== 'bundle' || !Array.isArray(bundle.objects)) {
    result.errors.push('Invalid STIX bundle: missing type="bundle" or objects array');
    return result;
  }

  result.stats.totalObjects = bundle.objects.length;

  // Process each object.
  for (const obj of bundle.objects) {
    // Count by type.
    result.stats.byType[obj.type] = (result.stats.byType[obj.type] ?? 0) + 1;

    switch (obj.type) {
      case 'indicator': {
        if (!obj.pattern) {
          result.errors.push(`Indicator ${obj.id} has no pattern — skipped`);
          break;
        }
        const { type, value } = extractFromPattern(obj.pattern);
        if (value) {
          result.indicators.push({
            stixId: obj.id,
            type,
            value,
            pattern: obj.pattern,
            validFrom: obj.valid_from,
            labels: obj.labels ?? [],
            description: obj.description ?? '',
          });
        }
        break;
      }

      case 'threat-actor': {
        result.actors.push({
          stixId: obj.id,
          name: obj.name ?? 'Unknown',
          aliases: obj.aliases ?? [],
          description: obj.description ?? '',
          roles: obj.roles ?? [],
          motivations: [
            ...(obj.primary_motivation ? [obj.primary_motivation] : []),
            ...(obj.secondary_motivations ?? []),
          ],
          externalRefs: extractExternalRefs(obj),
        });
        break;
      }

      case 'malware': {
        result.malware.push({
          stixId: obj.id,
          name: obj.name ?? 'Unknown',
          isFamily: obj.is_family ?? false,
          malwareTypes: obj.malware_types ?? [],
          description: obj.description ?? '',
          aliases: obj.aliases ?? [],
          externalRefs: extractExternalRefs(obj),
        });
        break;
      }

      case 'attack-pattern': {
        result.attackPatterns.push({
          stixId: obj.id,
          name: obj.name ?? 'Unknown',
          description: obj.description ?? '',
          killChainPhases: (obj.kill_chain_phases ?? []).map((p) => ({
            chain: p.kill_chain_name,
            phase: p.phase_name,
          })),
          externalRefs: extractExternalRefs(obj),
        });
        break;
      }

      case 'vulnerability': {
        result.vulnerabilities.push({
          stixId: obj.id,
          name: obj.name ?? 'Unknown',
          description: obj.description ?? '',
          externalRefs: extractExternalRefs(obj),
        });
        break;
      }

      case 'relationship': {
        if (obj.relationship_type && obj.source_ref && obj.target_ref) {
          result.relationships.push({
            stixId: obj.id,
            type: obj.relationship_type,
            sourceRef: obj.source_ref,
            targetRef: obj.target_ref,
            description: obj.description,
          });
        }
        break;
      }

      case 'campaign': {
        result.campaigns.push({
          stixId: obj.id,
          name: obj.name ?? 'Unknown',
          description: obj.description ?? '',
          firstSeen: obj.first_seen,
          lastSeen: obj.last_seen,
          aliases: obj.aliases ?? [],
          externalRefs: extractExternalRefs(obj),
        });
        break;
      }

      case 'report': {
        result.reports.push({
          stixId: obj.id,
          name: obj.name ?? 'Unknown',
          description: obj.description ?? '',
          published: obj.published,
          labels: obj.labels ?? [],
          objectRefs: obj.object_refs ?? [],
          externalRefs: extractExternalRefs(obj),
        });
        break;
      }

      // Ignore SDOs we don't process (identity, marking-definition, etc.)
      default:
        break;
    }
  }

  result.valid = result.errors.length === 0 || result.indicators.length > 0;
  return result;
}

/**
 * Convert a parsed STIX indicator to the platform's IOC format.
 */
export function stixIndicatorToIoc(indicator: ParsedIndicator): {
  type: string;
  value: string;
  source: string;
  confidence: number;
  tags: string[];
} {
  return {
    type: indicator.type,
    value: indicator.value,
    source: 'stix-import',
    confidence: 60, // Moderate — imported, not independently verified
    tags: indicator.labels,
  };
}

/**
 * Convert a parsed STIX actor to the platform's actor format.
 */
export function stixActorToPlatformActor(actor: ParsedActor): {
  slug: string;
  canonical: string;
  aliases: string[];
  description?: string;
  source: string;
} {
  const slug = actor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    slug,
    canonical: actor.name,
    aliases: actor.aliases,
    description: actor.description,
    source: 'stix-import',
  };
}
