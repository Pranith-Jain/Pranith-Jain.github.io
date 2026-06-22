/**
 * IOC STIX 2.1 Export — export indicators in STIX 2.1 bundle format.
 *
 * Generates STIX 2.1 compliant bundles from workspace findings and IOC data.
 * Supports: IPv4, IPv6, domain, URL, email, file hashes (MD5/SHA1/SHA256).
 */

export type StixIndicatorType =
  | 'ipv4-addr'
  | 'ipv6-addr'
  | 'domain-name'
  | 'url'
  | 'email-addr'
  | 'file:hashes.MD5'
  | 'file:hashes.SHA-1'
  | 'file:hashes.SHA-256'
  | 'autonomous-system';

export interface StixIndicator {
  value: string;
  type: StixIndicatorType;
  label?: string;
  confidence?: number;
  tlp?: 'WHITE' | 'GREEN' | 'AMBER' | 'RED';
  tags?: string[];
  description?: string;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  spec_version: '2.1';
  created: string;
  objects: Array<Record<string, unknown>>;
}

function stixId(type: string, value: string): string {
  const enc = new TextEncoder();
  const data = enc.encode(`${type}:${value}`);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + (data[i] ?? 0)) | 0;
  }
  return `${type}--${Math.abs(hash).toString(16).padStart(8, '0')}-${Date.now().toString(36)}`;
}

function determineStixType(indicator: string): StixIndicatorType | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(indicator)) return 'ipv4-addr';
  if (/^[a-f0-9:]{2,39}$/i.test(indicator) && indicator.includes(':')) return 'ipv6-addr';
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(indicator)) return 'domain-name';
  if (/^https?:\/\//i.test(indicator)) return 'url';
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(indicator)) return 'email-addr';
  if (/^[a-f0-9]{32}$/i.test(indicator)) return 'file:hashes.MD5';
  if (/^[a-f0-9]{40}$/i.test(indicator)) return 'file:hashes.SHA-1';
  if (/^[a-f0-9]{64}$/i.test(indicator)) return 'file:hashes.SHA-256';
  if (/^AS\d+$/i.test(indicator)) return 'autonomous-system';
  return null;
}

function stixPattern(indicatorType: StixIndicatorType, value: string): string {
  switch (indicatorType) {
    case 'ipv4-addr':
      return `[ipv4-addr:value = '${value}']`;
    case 'ipv6-addr':
      return `[ipv6-addr:value = '${value}']`;
    case 'domain-name':
      return `[domain-name:value = '${value}']`;
    case 'url':
      return `[url:value = '${value}']`;
    case 'email-addr':
      return `[email-addr:value = '${value}']`;
    case 'file:hashes.MD5':
      return `[file:hashes.MD5 = '${value}']`;
    case 'file:hashes.SHA-1':
      return `[file:hashes.'SHA-1' = '${value}']`;
    case 'file:hashes.SHA-256':
      return `[file:hashes.'SHA-256' = '${value}']`;
    case 'autonomous-system':
      return `[autonomous-system:number = ${value.replace(/^AS/i, '')}]`;
    default:
      return `[artifact:payload_bin = '${value}']`;
  }
}

function tlpMarking(tlp: string): Record<string, unknown> {
  const id = stixId('marking-definition', `tlp-${tlp.toLowerCase()}`);
  const definitions: Record<string, Record<string, unknown>> = {
    WHITE: { definition_type: 'tlp', definition: { tlp: 'WHITE' } },
    GREEN: { definition_type: 'tlp', definition: { tlp: 'GREEN' } },
    AMBER: { definition_type: 'tlp', definition: { tlp: 'AMBER' } },
    RED: { definition_type: 'tlp', definition: { tlp: 'RED' } },
  };
  const def = definitions[tlp] ?? { definition_type: 'tlp', definition: { tlp: 'GREEN' } };
  return {
    type: 'marking-definition',
    spec_version: '2.1',
    id,
    created: new Date().toISOString(),
    definition_type: def.definition_type,
    definition: def.definition,
  };
}

/** Build a STIX 2.1 bundle from a list of indicators. */
export function buildStixBundle(
  indicators: StixIndicator[],
  opts?: {
    bundleName?: string;
    defaultTlp?: string;
    source?: string;
  }
): StixBundle {
  const now = new Date().toISOString();
  const objects: Array<Record<string, unknown>> = [];
  const markingIds = new Set<string>();

  // Identity
  const identityId = stixId('identity', opts?.source || 'cti-platform');
  objects.push({
    type: 'identity',
    spec_version: '2.1',
    id: identityId,
    created: now,
    modified: now,
    name: opts?.source || 'CTI Platform',
    identity_class: 'organization',
  });

  // Report
  const reportId = stixId('report', opts?.bundleName || 'ioc-export');
  objects.push({
    type: 'report',
    spec_version: '2.1',
    id: reportId,
    created: now,
    modified: now,
    name: opts?.bundleName || `IOC Export — ${now.split('T')[0]}`,
    published: now,
    created_by_ref: identityId,
    object_refs: [] as string[],
  });

  for (const ind of indicators) {
    const indType = ind.type || determineStixType(ind.value);
    if (!indType) continue;

    // Add TLP marking if needed
    const tlp = ind.tlp || (opts?.defaultTlp as string) || 'GREEN';
    const markingId = stixId('marking-definition', `tlp-${tlp.toLowerCase()}`);
    if (!markingIds.has(markingId)) {
      objects.push(tlpMarking(tlp));
      markingIds.add(markingId);
    }

    // Indicator
    const indicatorId = stixId('indicator', ind.value);
    const stixIndicator: Record<string, unknown> = {
      type: 'indicator',
      spec_version: '2.1',
      id: indicatorId,
      created: now,
      modified: now,
      name: ind.label || ind.value,
      description: ind.description || `Indicator: ${ind.value}`,
      pattern: stixPattern(indType, ind.value),
      pattern_type: 'stix',
      valid_from: now,
      created_by_ref: identityId,
      object_marking_refs: [markingId],
      confidence: ind.confidence ?? 50,
      labels: ind.tags || [],
    };

    // Add custom type field
    if (indType.startsWith('file:')) {
      stixIndicator.pattern_type = 'stix';
    }

    objects.push(stixIndicator);

    // Add to report refs
    const reportObj = objects.find((o) => o.type === 'report') as Record<string, unknown>;
    if (reportObj) {
      (reportObj.object_refs as string[]).push(indicatorId);
    }
  }

  return {
    type: 'bundle',
    id: stixId('bundle', `export-${Date.now()}`),
    spec_version: '2.1',
    created: now,
    objects,
  };
}

/** Build a flat IOC list (plain text, one per line). */
export function buildFlatIocList(indicators: StixIndicator[]): string {
  return indicators
    .map((i) => {
      const parts = [i.value];
      if (i.type) parts.push(`# type: ${i.type}`);
      if (i.confidence) parts.push(`# confidence: ${i.confidence}`);
      if (i.tags?.length) parts.push(`# tags: ${i.tags.join(',')}`);
      return parts.join(' ');
    })
    .join('\n');
}
