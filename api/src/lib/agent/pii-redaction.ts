/**
 * PII redaction — replaces personally identifiable information with stable
 * numbered placeholders ([EMAIL_1], [PHONE_1], etc.) and produces a
 * reversible JSON map so a report can leave the organisation and still be
 * reconstituted for evidence.
 *
 * Infrastructure (actor domains, IPs, hashes) is NOT redacted by default —
 * in a CTI report the actor's domains are the analysis, not incidental PII.
 *
 * Ported from cti-expert's /redact concept (7onez/cti-expert).
 */

export type PiiType = 'EMAIL' | 'PHONE' | 'SSN' | 'CREDIT_CARD' | 'IBAN' | 'NAME_PATTERN';

export interface RedactionEntry {
  placeholder: string;
  original: string;
  type: PiiType;
  occurrences: number;
}

export interface RedactionResult {
  redacted: string;
  map: RedactionEntry[];
  totalRedactions: number;
  reversible: boolean;
}

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC_RE = /\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2})|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){2,7}[\dA-Z]{1,4}\b/g;

const INFRA_RE =
  /\b(?:\d{1,3}(?:\.\d{1,3}){3}|[a-f0-9]{32,64}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}|https?:\/\/[^\s"'<>]+)\b/gi;

export function redactPii(text: string, opts?: { redactInfrastructure?: boolean }): RedactionResult {
  const counters: Record<PiiType, number> = { EMAIL: 0, PHONE: 0, SSN: 0, CREDIT_CARD: 0, IBAN: 0, NAME_PATTERN: 0 };
  const valueToPlaceholder = new Map<string, string>();
  const map: RedactionEntry[] = [];
  let result = text;

  const infraMatches = new Set<string>();
  if (!opts?.redactInfrastructure) {
    for (const m of text.matchAll(INFRA_RE)) infraMatches.add(m[0]);
  }

  const replace = (re: RegExp, type: PiiType) => {
    result = result.replace(re, (match) => {
      if (infraMatches.has(match)) return match;

      const existing = valueToPlaceholder.get(match);
      if (existing) {
        const entry = map.find((e) => e.placeholder === existing);
        if (entry) entry.occurrences++;
        return existing;
      }

      counters[type]++;
      const placeholder = `[${type}_${counters[type]}]`;
      valueToPlaceholder.set(match, placeholder);
      map.push({ placeholder, original: match, type, occurrences: 1 });
      return placeholder;
    });
  };

  replace(SSN_RE, 'SSN');
  replace(CC_RE, 'CREDIT_CARD');
  replace(IBAN_RE, 'IBAN');
  replace(EMAIL_RE, 'EMAIL');
  replace(PHONE_RE, 'PHONE');

  const totalRedactions = map.reduce((sum, e) => sum + e.occurrences, 0);

  return {
    redacted: result,
    map,
    totalRedactions,
    reversible: true,
  };
}

export function restorePii(redacted: string, map: RedactionEntry[]): string {
  let result = redacted;
  for (const entry of map) {
    result = result.split(entry.placeholder).join(entry.original);
  }
  return result;
}
