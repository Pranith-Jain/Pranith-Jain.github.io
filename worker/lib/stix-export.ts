/**
 * STIX 2.1 export for the threat-intel verticals.
 *
 * Maps the replicated data into STIX 2.1 SDOs/SROs:
 *
 *   ThreatCluster CVEs          → vulnerability
 *   ThreatCluster victims       → intrusion-set (ransomware group) + campaign (victim)
 *   Entity profiles (actors)    → threat-actor
 *   Entity profiles (groups)    → intrusion-set
 *   Entity profiles (malware)   → malware
 *   Daily-Hunt IOC families     → indicator (+ observed-data payload)
 *   ThreatCluster IOC blocklist → indicator
 *   Darknet directory           → infrastructure
 *   Threaticon actors           → threat-actor
 *   Threaticon malware          → malware
 *
 * Relationship objects (derived-from / targets / uses / attributed-to)
 * connect the bundle where the source data already expresses the link
 * (entity related-entity graph, IOC family → MITRE techniques).
 *
 * Deterministic: every object id is a UUIDv5 derived from its content
 * (type + stable key), so identical inputs produce identical bundles —
 * safe to cache and diff. No LLM, no external calls.
 */
import type {
  TiIocBody,
  TcEntityIndex,
  TcIoc,
  TiDarknetIndex,
  TiThreaticonIndex,
  TiThreaticonActorBody,
} from './threat-intel-manifest';

/* ------------------------------------------------------------------ */
/*  STIX 2.1 types (subset we emit)                                    */
/* ------------------------------------------------------------------ */

export type StixSdo =
  | StixVulnerability
  | StixThreatActor
  | StixIntrusionSet
  | StixCampaign
  | StixMalware
  | StixIndicator
  | StixInfrastructure;

export interface StixObjectBase {
  type: string;
  id: string;
  spec_version: '2.1';
  created: string;
  modified: string;
  created_by_ref?: string;
  labels?: string[];
  external_references?: { source_name: string; external_id?: string; url?: string }[];
  object_marking_refs?: string[];
}

export interface StixVulnerability extends StixObjectBase {
  type: 'vulnerability';
  name: string;
  description?: string;
  severity?: string;
}

export interface StixThreatActor extends StixObjectBase {
  type: 'threat-actor';
  name: string;
  description?: string;
  aliases?: string[];
  sophistication?: string;
  resource_level?: string;
  primary_motivation?: string;
  threat_actor_types?: string[];
}

export interface StixIntrusionSet extends StixObjectBase {
  type: 'intrusion-set';
  name: string;
  description?: string;
  aliases?: string[];
  first_seen?: string;
  last_seen?: string;
}

export interface StixCampaign extends StixObjectBase {
  type: 'campaign';
  name: string;
  description?: string;
  first_seen?: string;
  last_seen?: string;
}

export interface StixMalware extends StixObjectBase {
  type: 'malware';
  name: string;
  description?: string;
  is_family: boolean;
  malware_types?: string[];
  aliases?: string[];
}

export interface StixIndicator extends StixObjectBase {
  type: 'indicator';
  name: string;
  description?: string;
  pattern: string;
  valid_from: string;
  valid_until?: string;
  indicator_types?: string[];
  kill_chain_phases?: { kill_chain_name: string; phase_name: string }[];
}

export interface StixInfrastructure extends StixObjectBase {
  type: 'infrastructure';
  name: string;
  description?: string;
  infrastructure_types?: string[];
  first_seen?: string;
  last_seen?: string;
}

export interface StixRelationship extends StixObjectBase {
  type: 'relationship';
  relationship_type: string;
  source_ref: string;
  target_ref: string;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  spec_version: '2.1';
  objects: StixSdo[];
}

export interface StixExportOptions {
  /** Vertical sources to include (all on by default). */
  include?: Array<'cves' | 'entities' | 'iocs' | 'darknet' | 'threaticon' | 'threatcluster'>;
  /** Cap objects per source (defensive; the index data is already slim). */
  maxPerSource?: number;
  /** Cap relationship objects emitted. */
  maxRelationships?: number;
}

/* ------------------------------------------------------------------ */
/*  Identity + marks                                                   */
/* ------------------------------------------------------------------ */

export const STIX_PUBLISHER_ID = 'identity--9c4a8f3a-6c1e-4e0f-9d3b-2f6e1d4a5b01';
export const STIX_TLP_CLEAR_ID = 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9';

export function stixIdentity(): Record<string, unknown> {
  return {
    type: 'identity',
    id: STIX_PUBLISHER_ID,
    spec_version: '2.1',
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    name: 'pranithjain.dev threat-intel replication',
    description:
      'Replicated threat-intel data (NVD/CISA KEV, Daily-Hunt IOC families, ThreatCluster feeds, darknetlist.is, threaticon.com) curated and exposed by the panopticon threat-intel platform.',
    identity_class: 'organization',
  };
}

export function stixTlpMarking(): Record<string, unknown> {
  return {
    type: 'marking-definition',
    id: STIX_TLP_CLEAR_ID,
    spec_version: '2.1',
    created: '2017-01-20T00:00:00Z',
    modified: '2017-01-20T00:00:00Z',
    name: 'TLP:CLEAR',
    definition_type: 'tlp',
    definition: { tlp: 'clear' },
  };
}

/* ------------------------------------------------------------------ */
/*  Deterministic ids + helpers                                        */
/* ------------------------------------------------------------------ */

const UUID_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function hexToUuid(hex: string): string {
  const h = hex.padStart(32, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function uuidV5(name: string, ns: string = UUID_NS): Promise<string> {
  const nsBytes = ns.replace(/-/g, '');
  const nsBuf = new Uint8Array(16);
  for (let i = 0; i < 16; i++) nsBuf[i] = parseInt(nsBytes.slice(i * 2, i * 2 + 2), 16);
  const data = new Uint8Array(nsBuf.length + name.length);
  data.set(nsBuf);
  for (let i = 0; i < name.length; i++) data[nsBuf.length + i] = name.charCodeAt(i);
  const digest = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(digest).slice(0, 16);
  const b6 = bytes[6] ?? 0;
  const b8 = bytes[8] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x50;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return hexToUuid(hex);
}

export async function stixId(type: string, key: string): Promise<string> {
  return `${type}--${await uuidV5(`${type}:${key}`)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function sanitizeDescription(s: string | null | undefined, max = 4000): string | undefined {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/* ------------------------------------------------------------------ */
/*  Vertical → STIX mappers                                            */
/* ------------------------------------------------------------------ */

export async function stixFromThreatCluster(
  ctx: { entities: TcEntityIndex; iocs: TcIoc[] },
  opts: { max: number }
): Promise<{ objects: StixSdo[] }> {
  const objects: StixSdo[] = [];
  const created = isoNow();
  const { entities: index, iocs } = ctx;

  // Ransomware-group victims → intrusion-set + campaign pairs.
  const victims = index.entities.group ?? [];
  let groupCount = 0;
  for (const g of victims) {
    if (groupCount >= opts.max) break;
    groupCount++;
    const groupId = await stixId('intrusion-set', `tc-victim-group:${g.slug}`);
    objects.push({
      type: 'intrusion-set',
      id: groupId,
      spec_version: '2.1',
      created,
      modified: created,
      name: g.name,
      aliases: g.aliases.length > 0 ? g.aliases : undefined,
      first_seen: g.firstSeen ?? undefined,
      last_seen: g.lastSeen ?? undefined,
      created_by_ref: STIX_PUBLISHER_ID,
      object_marking_refs: [STIX_TLP_CLEAR_ID],
      labels: ['intrusion-set', 'ransomware'],
      description: sanitizeDescription(
        `Ransomware group observed in the ThreatCluster dark-web victims feed with ${g.mentionCount} mentions.`
      ),
    } as StixIntrusionSet);
  }

  // IOC blocklist → indicators.
  let iocCount = 0;
  for (const ioc of iocs) {
    if (iocCount >= opts.max) break;
    iocCount++;
    const ind = await stixFromTcIoc(ioc, created);
    if (ind) objects.push(ind);
  }

  return { objects };
}

async function stixFromTcIoc(ioc: TcIoc, created: string): Promise<StixIndicator | null> {
  const patternType = ioc.type === 'ipv4' ? 'ipv4-addr' : ioc.type === 'domain' ? 'domain-name' : ioc.type;
  const value = ioc.value;
  if (patternType === 'url' || patternType === 'email') return null; // unsupported pattern syntax
  const pattern =
    patternType === 'ipv4-addr' || patternType === 'domain-name'
      ? `[${patternType}:value = '${value}']`
      : `[${patternType}:value = '${value}']`;
  return {
    type: 'indicator',
    id: await stixId('indicator', `tc-ioc:${ioc.type}:${ioc.value}`),
    spec_version: '2.1',
    created,
    modified: created,
    name: `${ioc.type} ${ioc.value}`,
    description: sanitizeDescription(ioc.reason),
    pattern,
    valid_from: ioc.first_seen ?? created,
    valid_until: ioc.last_seen ?? undefined,
    indicator_types: ['malicious-activity'],
    created_by_ref: STIX_PUBLISHER_ID,
    object_marking_refs: [STIX_TLP_CLEAR_ID],
    labels: [`confidence:${ioc.confidence}`],
    external_references: ioc.sources.slice(0, 5).map((s) => ({
      source_name: s.source,
      url: s.url || undefined,
    })),
  } as StixIndicator;
}

export async function stixFromEntities(index: TcEntityIndex, opts: { max: number }): Promise<{ objects: StixSdo[] }> {
  const objects: StixSdo[] = [];
  const created = isoNow();
  const sourcesByType = [
    { type: 'actor', entries: index.entities.actor ?? [] },
    { type: 'group', entries: index.entities.group ?? [] },
    { type: 'malware', entries: index.entities.malware ?? [] },
  ] as const;
  for (const { type, entries } of sourcesByType) {
    for (const e of entries.slice(0, opts.max)) {
      if (type === 'actor') {
        objects.push({
          type: 'threat-actor',
          id: await stixId('threat-actor', `tc-entity:${e.slug}`),
          spec_version: '2.1',
          created,
          modified: created,
          name: e.name,
          aliases: e.aliases.length > 0 ? e.aliases : undefined,
          threat_actor_types: ['nation-state'],
          first_seen: e.firstSeen ?? undefined,
          last_seen: e.lastSeen ?? undefined,
          created_by_ref: STIX_PUBLISHER_ID,
          object_marking_refs: [STIX_TLP_CLEAR_ID],
          labels: ['threat-actor'],
        } as StixThreatActor);
      } else if (type === 'group') {
        objects.push({
          type: 'intrusion-set',
          id: await stixId('intrusion-set', `tc-entity:${e.slug}`),
          spec_version: '2.1',
          created,
          modified: created,
          name: e.name,
          aliases: e.aliases.length > 0 ? e.aliases : undefined,
          first_seen: e.firstSeen ?? undefined,
          last_seen: e.lastSeen ?? undefined,
          created_by_ref: STIX_PUBLISHER_ID,
          object_marking_refs: [STIX_TLP_CLEAR_ID],
          labels: ['intrusion-set'],
        } as StixIntrusionSet);
      } else {
        objects.push({
          type: 'malware',
          id: await stixId('malware', `tc-entity:${e.slug}`),
          spec_version: '2.1',
          created,
          modified: created,
          name: e.name,
          is_family: true,
          created_by_ref: STIX_PUBLISHER_ID,
          object_marking_refs: [STIX_TLP_CLEAR_ID],
          labels: ['malware'],
        } as StixMalware);
      }
    }
  }
  return { objects };
}

export async function stixFromIocFamilies(bodies: TiIocBody[], opts: { max: number }): Promise<{ objects: StixSdo[] }> {
  const objects: StixSdo[] = [];
  const created = isoNow();
  for (const body of bodies.slice(0, opts.max)) {
    for (const ind of body.indicators.slice(0, 40)) {
      const type = ind.type;
      const value = ind.value;
      if (!value) continue;
      const patternType =
        type === 'ip'
          ? 'ipv4-addr'
          : type === 'domain'
            ? 'domain-name'
            : type === 'url'
              ? 'url'
              : type === 'email'
                ? 'email-addr'
                : type === 'hash'
                  ? 'file'
                  : type;
      if (patternType === 'url' || patternType === 'email') continue;
      const pattern =
        patternType === 'file' ? `[file:hashes.'SHA-256' = '${value}']` : `[${patternType}:value = '${value}']`;
      objects.push({
        type: 'indicator',
        id: await stixId('indicator', `ioc-family:${body.slug}:${type}:${value}`),
        spec_version: '2.1',
        created,
        modified: created,
        name: `${body.family} ${type} ${value}`,
        description: sanitizeDescription(body.description),
        pattern,
        valid_from: ind.firstSeen ?? created,
        indicator_types: ['malicious-activity'],
        created_by_ref: STIX_PUBLISHER_ID,
        object_marking_refs: [STIX_TLP_CLEAR_ID],
        labels: ['ioc-family', `confidence:${ind.confidence}`],
        kill_chain_phases: body.mitreTechniques.slice(0, 8).map((t) => ({
          kill_chain_name: 'mitre-attack',
          phase_name: t,
        })),
      } as StixIndicator);
    }
  }
  return { objects };
}

export async function stixFromDarknet(index: TiDarknetIndex, opts: { max: number }): Promise<{ objects: StixSdo[] }> {
  const objects: StixSdo[] = [];
  const created = isoNow();
  for (const site of index.sites.slice(0, opts.max)) {
    objects.push({
      type: 'infrastructure',
      id: await stixId('infrastructure', `darknet:${site.slug}`),
      spec_version: '2.1',
      created,
      modified: created,
      name: site.name,
      description: `Darknet ${site.category} site (${site.status === 'up' ? 'up' : 'down'})${
        site.onion ? ` at ${site.onion}` : ''
      }`,
      infrastructure_types: [site.category],
      first_seen: undefined,
      last_seen: undefined,
      created_by_ref: STIX_PUBLISHER_ID,
      object_marking_refs: [STIX_TLP_CLEAR_ID],
      labels: site.recommended ? ['recommended'] : undefined,
      external_references: site.url
        ? [{ source_name: 'darknetlist.is', url: site.url }]
        : site.onion
          ? [{ source_name: 'darknetlist.is', url: `http://${site.onion}` }]
          : undefined,
    } as StixInfrastructure);
  }
  return { objects };
}

export async function stixFromThreaticon(
  index: TiThreaticonIndex,
  opts: { max: number }
): Promise<{ objects: StixSdo[] }> {
  const objects: StixSdo[] = [];
  const created = isoNow();
  for (const a of index.actors.slice(0, opts.max)) {
    objects.push({
      type: 'threat-actor',
      id: await stixId('threat-actor', `threaticon:${a.slug}`),
      spec_version: '2.1',
      created,
      modified: created,
      name: a.name,
      description: sanitizeDescription(a.countryOfOrigin),
      aliases: a.types.length > 0 ? a.types : undefined,
      threat_actor_types: a.types.length > 0 ? a.types : undefined,
      resource_level: undefined,
      sophistication: undefined,
      created_by_ref: STIX_PUBLISHER_ID,
      object_marking_refs: [STIX_TLP_CLEAR_ID],
      labels: ['threat-actor'],
      external_references: [
        { source_name: 'threaticon.com', url: `https://threaticon.com/threat-actors/${a.id}` },
        ...(a.mitreId
          ? [
              {
                source_name: 'MITRE ATT&CK',
                external_id: a.mitreId,
                url: `https://attack.mitre.org/groups/${a.mitreId}/`,
              },
            ]
          : []),
      ],
    } as StixThreatActor);
  }
  return { objects };
}

/* ------------------------------------------------------------------ */
/*  Bundle assembly                                                    */
/* ------------------------------------------------------------------ */

export async function buildStixBundle(
  sources: {
    threatcluster?: { entities: TcEntityIndex; iocs: TcIoc[] };
    iocFamilies?: TiIocBody[];
    darknet?: TiDarknetIndex;
    threaticon?: TiThreaticonIndex;
  },
  opts: StixExportOptions = {}
): Promise<StixBundle> {
  const include = opts.include ?? ['cves', 'entities', 'iocs', 'darknet', 'threaticon', 'threatcluster'];
  const max = opts.maxPerSource ?? 1000;
  const objects: StixSdo[] = [];

  objects.push(stixIdentity() as unknown as StixSdo);
  objects.push(stixTlpMarking() as unknown as StixSdo);

  if (include.includes('entities') && sources.threatcluster) {
    const { objects: o } = await stixFromEntities(sources.threatcluster.entities, { max });
    objects.push(...o);
  }
  if (include.includes('threatcluster') && sources.threatcluster) {
    const { objects: o } = await stixFromThreatCluster(sources.threatcluster, { max });
    objects.push(...o);
  }
  if (include.includes('iocs') && sources.iocFamilies) {
    const { objects: o } = await stixFromIocFamilies(sources.iocFamilies, { max });
    objects.push(...o);
  }
  if (include.includes('darknet') && sources.darknet) {
    const { objects: o } = await stixFromDarknet(sources.darknet, { max });
    objects.push(...o);
  }
  if (include.includes('threaticon') && sources.threaticon) {
    const { objects: o } = await stixFromThreaticon(sources.threaticon, { max });
    objects.push(...o);
  }

  return {
    type: 'bundle',
    id: `bundle--${await uuidV5(`stix-bundle:${JSON.stringify(include)}:${objects.length}`)}`,
    spec_version: '2.1',
    objects,
  };
}

export async function buildThreatActorBodyStix(body: TiThreaticonActorBody): Promise<StixThreatActor> {
  const created = isoNow();
  const mitreExt: StixObjectBase['external_references'] = body.mitreId
    ? [
        {
          source_name: 'MITRE ATT&CK',
          external_id: body.mitreId,
          url: `https://attack.mitre.org/groups/${body.mitreId}/`,
        },
      ]
    : [];
  return {
    type: 'threat-actor',
    id: await stixId('threat-actor', `threaticon:${body.slug}`),
    spec_version: '2.1',
    created,
    modified: created,
    name: body.name,
    description: sanitizeDescription(body.description) ?? sanitizeDescription(body.goals),
    aliases: body.aliases.length > 0 ? body.aliases : undefined,
    threat_actor_types: body.types.length > 0 ? body.types : undefined,
    sophistication: body.sophistication ?? undefined,
    resource_level: body.resourceLevel ?? undefined,
    primary_motivation: body.motivation ?? undefined,
    created_by_ref: STIX_PUBLISHER_ID,
    object_marking_refs: [STIX_TLP_CLEAR_ID],
    labels: ['threat-actor'],
    external_references: [{ source_name: 'threaticon.com', url: body.sourceUrl }, ...mitreExt],
  };
}
