export interface StixActor {
  id: string;
  name: string;
  aliases: string[];
  motivation?: string;
}

export interface StixCampaign {
  id: string;
  name: string;
  description?: string;
  first_seen?: string;
  actor_id?: string;
}

export interface StixAttackPattern {
  id: string;
  name: string;
  mitre_id?: string;
}

export interface StixIndicator {
  id: string;
  pattern: string;
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';
  value: string;
  labels: string[];
}

export interface ParsedStix {
  actors: StixActor[];
  campaigns: StixCampaign[];
  attack_patterns: StixAttackPattern[];
  indicators: StixIndicator[];
}

const PATTERN_RE = /^\[(?<obj>[a-z][a-z0-9-]*)(?::(?<prop>[^\s=]+))?\s*=\s*'(?<val>[^']+)'\s*\]$/i;

export function parseStixPattern(pattern: string): { type: StixIndicator['type']; value: string } {
  const m = pattern.trim().match(PATTERN_RE);
  if (!m || !m.groups) return { type: 'unknown', value: '' };
  const { obj, prop, val } = m.groups;
  if (obj === 'ipv4-addr') return { type: 'ipv4', value: val };
  if (obj === 'ipv6-addr') return { type: 'ipv6', value: val };
  if (obj === 'domain-name') return { type: 'domain', value: val };
  if (obj === 'url') return { type: 'url', value: val };
  if (obj === 'email-addr') return { type: 'email', value: val };
  if (obj === 'file' && prop?.startsWith('hashes')) return { type: 'hash', value: val };
  return { type: 'unknown', value: val };
}

interface StixObject {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface StixBundle {
  type: string;
  id?: string;
  objects?: StixObject[];
}

export function parseStixBundle(bundle: StixBundle): ParsedStix {
  if (!bundle || bundle.type !== 'bundle') {
    throw new Error('not a STIX bundle');
  }
  const objs = bundle.objects ?? [];
  const out: ParsedStix = { actors: [], campaigns: [], attack_patterns: [], indicators: [] };
  const relationships: Array<{ source_ref: string; target_ref: string; relationship_type: string }> = [];

  for (const o of objs) {
    if (o.type === 'intrusion-set') {
      out.actors.push({
        id: o.id,
        name: String(o.name ?? ''),
        aliases: Array.isArray(o.aliases) ? (o.aliases as string[]) : [],
        motivation: typeof o.primary_motivation === 'string' ? o.primary_motivation : undefined,
      });
    } else if (o.type === 'campaign') {
      out.campaigns.push({
        id: o.id,
        name: String(o.name ?? ''),
        description: typeof o.description === 'string' ? o.description : undefined,
        first_seen: typeof o.first_seen === 'string' ? o.first_seen : undefined,
      });
    } else if (o.type === 'attack-pattern') {
      const refs = Array.isArray(o.external_references)
        ? (o.external_references as Array<{ source_name?: string; external_id?: string }>)
        : [];
      const mitre = refs.find((r) => r.source_name === 'mitre-attack');
      out.attack_patterns.push({
        id: o.id,
        name: String(o.name ?? ''),
        mitre_id: mitre?.external_id,
      });
    } else if (o.type === 'indicator') {
      const pattern = String(o.pattern ?? '');
      const parsed = parseStixPattern(pattern);
      out.indicators.push({
        id: o.id,
        pattern,
        type: parsed.type,
        value: parsed.value,
        labels: Array.isArray(o.labels) ? (o.labels as string[]) : [],
      });
    } else if (o.type === 'relationship') {
      relationships.push({
        source_ref: String(o.source_ref ?? ''),
        target_ref: String(o.target_ref ?? ''),
        relationship_type: String(o.relationship_type ?? ''),
      });
    }
  }

  // Resolve campaign → actor relationships ("attributed-to")
  for (const rel of relationships) {
    if (rel.relationship_type === 'attributed-to') {
      const camp = out.campaigns.find((c) => c.id === rel.source_ref);
      if (camp && rel.target_ref.startsWith('intrusion-set--')) {
        camp.actor_id = rel.target_ref;
      }
    }
  }

  return out;
}
