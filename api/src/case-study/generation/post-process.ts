import type { CaseStudyType, PostIOC } from '../types';
import { requiredSections } from './templates';

const PREAMBLE_RE = /^[\s\S]*?(?=##\s)/;
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/g;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
const SHA256_RE = /\b[a-f0-9]{64}\b/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;

export interface PostProcessInput {
  type: CaseStudyType;
  raw: string;
  factsText: string;
}

export interface PostProcessOutput {
  ok: boolean;
  body: string;
  iocs: PostIOC[];
  errors: string[];
}

export function postProcess(input: PostProcessInput): PostProcessOutput {
  const errors: string[] = [];

  const body = input.raw.replace(PREAMBLE_RE, '').trim();
  if (!body.startsWith('##')) {
    errors.push('output did not contain any section headers');
    return { ok: false, body, iocs: [], errors };
  }

  for (const section of requiredSections(input.type)) {
    const heading = section.replace(/^##\s*/, '').toLowerCase();
    const found = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im').test(body);
    if (!found) errors.push(`missing section: ${section}`);
  }

  const lowerFacts = input.factsText.toLowerCase();
  for (const m of body.match(CVE_RE) ?? []) {
    if (!lowerFacts.includes(m.toLowerCase())) {
      errors.push(`hallucinated CVE not in facts: ${m}`);
    }
  }

  const iocs: PostIOC[] = [];
  const seen = new Set<string>();
  const add = (type: PostIOC['type'], value: string) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    iocs.push({ type, value });
  };
  for (const m of body.match(IPV4_RE) ?? []) add('ipv4', m);
  for (const m of body.match(SHA256_RE) ?? []) add('sha256', m.toLowerCase());
  for (const m of body.match(DOMAIN_RE) ?? []) {
    if (/^(example\.|www\.example\.|cisa\.gov$|nvd\.nist\.gov$|github\.com$)/i.test(m)) continue;
    add('domain', m.toLowerCase());
  }

  return { ok: errors.length === 0, body, iocs, errors };
}
