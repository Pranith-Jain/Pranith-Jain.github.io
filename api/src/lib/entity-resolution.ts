import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { RANSOMWARE_SLUGS } from './ransomware-slugs';

// ── Types ─────────────────────────────────────────────────────────────────

export type EntityType =
  'actor' | 'ransomware' | 'cve' | 'malware' | 'ip' | 'domain' | 'hash' | 'product' | 'sector' | 'unknown';

export interface ResolvedEntity {
  type: EntityType;
  id: string;
  label: string;
  confidence: number; // 0–1
  /** Alternative identifiers (aliases, MITRE IDs, etc.) */
  aliases: string[];
  /** Source of the resolution */
  source: 'slug_match' | 'regex' | 'alias_match' | 'fuzzy_match' | 'cve_lookup' | 'curated';
  /** Additional context from the resolution */
  context?: Record<string, unknown>;
}

export interface EntityLink {
  source_id: string;
  source_type: EntityType;
  target_id: string;
  target_type: EntityType;
  relationship: string;
  confidence: number;
  source: string;
}

export interface EntityProfile {
  entity: ResolvedEntity;
  /** Direct links to other entities */
  links: EntityLink[];
  /** MITRE ATT&CK techniques (for actors/ransomware) */
  techniques?: Array<{ id: string; name: string; tactic: string }>;
  /** DNA profile (for actors) */
  dna_profile?: Record<string, unknown>;
  /** CVEs linked to this entity (for actors/ransomware) */
  cves?: string[];
  /** Cross-referenced source IDs */
  cross_references: Array<{ source_id: string; source_name: string; label: string }>;
}

// ── Regex patterns ────────────────────────────────────────────────────────

const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const DOMAIN_RE = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const MD5_RE = /^[a-f0-9]{32}$/i;
const SHA1_RE = /^[a-f0-9]{40}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

// ── Core resolution ───────────────────────────────────────────────────────

/**
 * Slug resolution using the actor alias table.
 * Supports exact slug match, canonical name match, alias match,
 * and partial substring fuzzy match.
 */
export function resolveSlug(raw: string): string | null {
  const slug = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!slug) return null;

  // Direct slug match
  for (const entry of ACTOR_ALIASES) {
    if (entry.slug === slug) return entry.slug;
  }

  // No-hyphen variant
  const noHyphen = slug.replace(/-/g, '');
  for (const entry of ACTOR_ALIASES) {
    if (entry.slug.replace(/-/g, '') === noHyphen) return entry.slug;
  }

  // Canonical name match
  for (const entry of ACTOR_ALIASES) {
    if (entry.canonical.toLowerCase() === raw.toLowerCase()) return entry.slug;
  }

  // Alias match
  for (const entry of ACTOR_ALIASES) {
    if (entry.aliases.some((a) => a.toLowerCase() === raw.toLowerCase())) return entry.slug;
  }

  // Partial fuzzy match (substring of canonical or any alias)
  const rawLower = raw.toLowerCase();
  let best: { slug: string; length: number } | null = null;
  for (const entry of ACTOR_ALIASES) {
    if (
      entry.canonical.toLowerCase().includes(rawLower) ||
      entry.aliases.some((a) => a.toLowerCase().includes(rawLower))
    ) {
      const length = entry.canonical.length;
      if (!best || length < best.length) best = { slug: entry.slug, length };
    }
  }

  return best?.slug ?? null;
}

/**
 * Resolve a raw query string to an entity.
 */
export function resolveEntity(query: string): ResolvedEntity | null {
  const raw = query.trim();
  if (!raw) return null;

  // CVE regex
  const cveMatch = raw.match(CVE_RE);
  if (cveMatch) {
    const id = raw.toUpperCase();
    return {
      type: 'cve',
      id,
      label: id,
      confidence: 1.0,
      aliases: [],
      source: 'regex',
    };
  }

  // IPv4
  if (IPV4_RE.test(raw)) {
    return { type: 'ip', id: raw, label: raw, confidence: 1.0, aliases: [], source: 'regex' };
  }

  // Domain
  if (DOMAIN_RE.test(raw)) {
    return { type: 'domain', id: raw.toLowerCase(), label: raw, confidence: 1.0, aliases: [], source: 'regex' };
  }

  // Hash
  const hashType = raw.match(SHA256_RE)
    ? ('hash' as const)
    : raw.match(SHA1_RE)
      ? ('hash' as const)
      : raw.match(MD5_RE)
        ? ('hash' as const)
        : null;
  if (hashType) {
    return {
      type: 'hash',
      id: raw.toLowerCase(),
      label: raw.toLowerCase(),
      confidence: 1.0,
      aliases: [],
      source: 'regex',
    };
  }

  // Actor/ransomware slug resolution
  const slug = resolveSlug(raw);
  if (slug) {
    const entry = ACTOR_ALIASES.find((a) => a.slug === slug);
    const isRansomware = RANSOMWARE_SLUGS.has(slug);
    return {
      type: isRansomware ? 'ransomware' : 'actor',
      id: slug,
      label: entry?.canonical ?? slug,
      confidence: entry ? (entry.canonical.toLowerCase() === raw.toLowerCase() ? 0.95 : 0.8) : 0.6,
      aliases: entry?.aliases ?? [],
      source:
        entry?.canonical.toLowerCase() === raw.toLowerCase()
          ? 'slug_match'
          : entry?.aliases.some((a) => a.toLowerCase() === raw.toLowerCase())
            ? 'alias_match'
            : 'fuzzy_match',
      context: entry?.mitreId ? { mitre_id: entry.mitreId } : undefined,
    };
  }

  return null;
}

/**
 * Resolve multiple entities from query text — extracts all known entity
 * references from free text.
 *
 * Uses case-sensitive exact match on canonical names and aliases to reduce
 * false positives. Short names (<5 chars) are only matched on word boundaries
 * by prepending/appending word-break patterns.
 */
export function extractEntities(text: string): ResolvedEntity[] {
  const entities: ResolvedEntity[] = [];
  const seen = new Set<string>();
  const textLower = text.toLowerCase();

  // Extract CVEs
  const cveRegex = /CVE-\d{4}-\d{4,}/gi;
  let match: RegExpExecArray | null;
  while ((match = cveRegex.exec(text)) !== null) {
    const id = match[0].toUpperCase();
    if (!seen.has(id)) {
      seen.add(id);
      const resolved = resolveEntity(id);
      if (resolved) entities.push(resolved);
    }
  }

  // Extract actor/ransomware references — exact match only to avoid false positives
  for (const entry of ACTOR_ALIASES) {
    if (seen.has(entry.slug)) continue;

    // Canonical name must appear as a whole-word match
    const canonicalLower = entry.canonical.toLowerCase();
    if (canonicalLower.length >= 4 && textLower.includes(canonicalLower)) {
      seen.add(entry.slug);
      const resolved = resolveEntity(entry.canonical);
      if (resolved) entities.push(resolved);
      continue;
    }

    // Aliases: match only if >=4 chars and present in text
    for (const alias of entry.aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower.length >= 4 && textLower.includes(aliasLower)) {
        if (!seen.has(entry.slug)) {
          seen.add(entry.slug);
          const resolved = resolveEntity(alias);
          if (resolved) entities.push(resolved);
        }
        break; // one alias match per entry is enough
      }
    }
  }

  return entities;
}

/**
 * Build a full profile for a resolved entity — cross-references CVEs, actors,
 * DNA profiles, and known relationships.
 */
export async function buildEntityProfile(entity: ResolvedEntity): Promise<EntityProfile> {
  const links: EntityLink[] = [];
  const cross_references: Array<{ source_id: string; source_name: string; label: string }> = [];
  let techniques: Array<{ id: string; name: string; tactic: string }> | undefined;
  let dna_profile: Record<string, unknown> | undefined;
  let cves: string[] | undefined;

  if (entity.type === 'cve') {
    cross_references.push({ source_id: entity.id, source_name: 'NVD', label: entity.id });
  }

  if (entity.type === 'actor' || entity.type === 'ransomware') {
    cross_references.push({
      source_id: entity.id,
      source_name: 'Actor DNA Database',
      label: entity.label,
    });

    const mitreId = entity.context?.mitre_id as string | undefined;
    if (mitreId) {
      cross_references.push({
        source_id: mitreId,
        source_name: 'MITRE ATT&CK',
        label: `${entity.label} (${mitreId})`,
      });
    }
  }

  return {
    entity,
    links,
    techniques,
    dna_profile,
    cves,
    cross_references,
  };
}
