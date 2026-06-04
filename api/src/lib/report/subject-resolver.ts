import type { ResolvedSubject, SubjectType, TemplateId } from './types';

const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;
const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const DOMAIN_RE = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const HASH_RE = /^[a-fA-F0-9]{32,64}$/;

/** Classify a free-text query into an entity type. Moved verbatim from copilot.ts. */
export function detectType(query: string): SubjectType {
  if (CVE_RE.test(query.trim())) return 'cve';
  if (IP_RE.test(query.trim())) return 'ip';
  if (DOMAIN_RE.test(query.trim())) return 'domain';
  if (HASH_RE.test(query.trim())) return 'hash';
  const lower = query.toLowerCase();
  if (
    [
      'lockbit',
      'ransom',
      'ransomware',
      'hive',
      'clop',
      'blackcat',
      'alphv',
      'royal',
      'play',
      'akira',
      'bashe',
      'bianlian',
      'cuba',
      'dragonforce',
      '8base',
    ].some((k) => lower.includes(k))
  )
    return 'ransomware';
  if (
    [
      'apt',
      'group',
      'actor',
      'threat',
      'scattered',
      'lazarus',
      'kimsu',
      'fancy',
      'cozy',
      'knotweed',
      'midnight',
      'volt',
      'typhoon',
      'panda',
      'dragon',
    ].some((k) => lower.includes(k))
  )
    return 'actor';
  return 'generic';
}

const TEMPLATE_BY_TYPE: Record<SubjectType, TemplateId> = {
  cve: 'cve',
  ip: 'ioc',
  domain: 'ioc',
  hash: 'ioc',
  actor: 'threat-actor',
  ransomware: 'ransomware-group',
  generic: 'threat-actor',
};

/**
 * Classify + canonicalize a query into a ResolvedSubject. Alias resolution
 * against the actor/ransomware KBs is layered in a later plan; here we only do
 * format-level canonicalization (no network, no catalog imports).
 */
export function resolveSubject(query: string): ResolvedSubject {
  const raw = query;
  const trimmed = query.trim();
  const type = detectType(trimmed);
  const identifiers: ResolvedSubject['identifiers'] = {};
  let canonical = trimmed;

  switch (type) {
    case 'cve':
      canonical = trimmed.toUpperCase();
      identifiers.cve = canonical;
      break;
    case 'ip':
      identifiers.iocType = 'ipv4';
      break;
    case 'domain':
      canonical = trimmed.toLowerCase();
      identifiers.iocType = 'domain';
      break;
    case 'hash':
      canonical = trimmed.toLowerCase();
      identifiers.iocType = 'hash';
      break;
    case 'ransomware':
      identifiers.group = trimmed;
      break;
    case 'actor':
    case 'generic':
      break;
  }

  return { raw, type, canonical, identifiers, suggestedTemplate: TEMPLATE_BY_TYPE[type] };
}
