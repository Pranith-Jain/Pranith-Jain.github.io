import type { CaseStudyType, PostIOC, QualityScore } from '../types';
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
  quality?: QualityScore;
}

/** Strip raw FACTS blocks the AI sometimes includes despite instructions. */
const FACTS_BLOCK_RE = /^FACTS:.*$/gm;
const OLD_FILLER_RE = /^No public reporting yet\.$/im;

/**
 * Patterns that indicate a section is filler (no real substance).
 * If a section's entire body matches these, the section is removed.
 */
const FILLER_PATTERNS = [
  /not well documented/i,
  /not well-known/i,
  /little is known/i,
  /limited information/i,
  /no specific references/i,
  /no public(ly)? (available|reporting)/i,
  /not publicly (available|known|disclosed)/i,
  /specific references are (not |un)available/i,
  /information is based on recent and ongoing events/i,
  /can stay informed about the latest/i,
  /organizations should prioritize/i,
  /organizations can protect/i,
];

/** Detect if a section body is just filler. */
function isFiller(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned) return true;
  // Single sentence or fragment matching a known filler pattern
  const sentences = cleaned.split(/[.!?]+/).filter(Boolean);
  if (sentences.length === 0) return true;
  if (sentences.length <= 2) {
    for (const pat of FILLER_PATTERNS) {
      if (pat.test(cleaned)) return true;
    }
  }
  return false;
}

/** Replace section names used without `##` prefix with proper markdown headers. */
const ALL_HEADINGS = [
  'Summary',
  'Affected products',
  'How it works',
  'Exploitation in the wild',
  'Detection & mitigation',
  'Detection and mitigation',
  'Detection & response',
  'Detection and response',
  'IOCs',
  'IOC',
  'References',
  'Origin and attribution',
  'Known campaigns',
  'TTPs',
  'TTP',
  'Targeted sectors',
  'Recent activity',
  'Defensive guidance',
  'Defensive recommendations',
  'Defensive takeaways',
  'Capabilities',
  'Delivery',
  'Infrastructure',
  'Detection',
  'Related families',
  'Group profile',
  'Recent victims',
  'Negotiation tactics',
  'What was exposed',
  'How it happened',
  'Impact and affected parties',
  'Lessons learned',
  'How the scam works',
  'Lures and channels',
  'Indicators and red flags',
  'Who is targeted',
  'Protective guidance',
  'Affected AI/ML system',
  'Attack technique',
  'Real-world impact',
  'Mitigations',
  'Key findings',
  'Technical analysis',
  'Tool overview',
  'Data sources',
  'Use cases',
  'Results & findings',
  'Results and findings',
  'Limitations',
  'Problem statement',
  'Approach',
  'Implementation',
  'Results',
  'Data sources & methodology',
  'Data sources and methodology',
  'Key metrics',
  'Observed trends',
  'Correlations',
  'Implications',
];
const ESCAPED = ALL_HEADINGS.map((h) => h.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
const SECTION_NAME_RE = new RegExp(`^(${ESCAPED.join('|')})[\\s:\\-]*$`, 'im');

function ensureMdHeaders(body: string): string {
  return body.replace(SECTION_NAME_RE, '## $1');
}

/** Strip sections whose content is empty or just filler. */
function stripEmptySections(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      const sectionBody: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('##')) {
        sectionBody.push(lines[i]);
        i++;
      }
      const content = sectionBody.join('\n').trim();
      if (content && !isFiller(content)) {
        result.push(line);
        if (content) {
          result.push('');
          result.push(...sectionBody.filter((l) => l.trim()));
        }
      }
    } else {
      result.push(line);
      i++;
    }
  }
  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Ensure blank lines after list blocks so marked doesn't swallow following text. */
function fixListBlocks(body: string): string {
  return body.replace(/^(\s*(?:[-*+]|\d+\.)\s.+)\n(?=\S)/gm, '$1\n\n');
}

/** Strip placeholder reference links pointing to example.com. */
function stripPlaceholderRefs(body: string): string {
  return body.replace(/\[([^\]]*)]\(https?:\/\/example\.com[^)]*\)/g, '');
}

export function postProcess(input: PostProcessInput): PostProcessOutput {
  const errors: string[] = [];

  let body = input.raw;
  // Step 1: Ensure section names have ## prefix
  body = ensureMdHeaders(body);
  // Step 2: Strip preamble before first ## heading
  body = body.replace(PREAMBLE_RE, '').trim();
  // Step 3: Strip FACTS blocks
  body = body.replace(FACTS_BLOCK_RE, '').trim();
  // Step 3a: Remove example.com placeholders
  body = stripPlaceholderRefs(body);
  // Step 3b: Fix list blocks missing blank lines after them
  body = fixListBlocks(body);
  // Step 4: Strip sections that are empty or filler
  body = stripEmptySections(body);
  // Step 5: Remove remaining old filler lines
  body = body.replace(OLD_FILLER_RE, '').trim();
  body = stripEmptySections(body);

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

  // Downgrade missing-section errors to warnings — AI is told to skip empty
  // sections; only hallucinated CVEs and critical issues should fail.
  const critical = errors.filter((e) => !e.startsWith('missing section:'));

  const quality = scoreQuality(body, iocs);

  return { ok: critical.length === 0, body, iocs, errors, quality };
}

// ─── Quality scoring ──────────────────────────────────────────────────────

const TECH_RE =
  /\b(CVE-\d{4}-\d{4,7}|CVSS\s*[0-9]\.[0-9]|HTTP\/[12]\.[01]|SMB|RDP|LDAP|Kerberos|NTLM|DLL|EXE|\.ps1|\.vbs|\.bat|registry|RunKey|WMI|PowerShell|Phishing|MFA|API|TCP\/[0-9]+|UDP\/[0-9]+)\b/gi;
const REF_RE = /\[([^\]]+)\]\(https?:\/\/[^)]+\)/g;

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function countSentences(s: string): number {
  return s.split(/[.!?]+/).filter((p) => p.trim().length > 0).length;
}

function scoreQuality(body: string, iocs: PostIOC[]): QualityScore {
  const wordCount = countWords(body);

  // Length score (0-30)
  const lengthScore = wordCount >= 800 && wordCount <= 1200 ? 30 : wordCount >= 500 || wordCount <= 1500 ? 20 : 10;

  // Section score (0-25)
  const sectionMatches = body.match(/^##\s+.+/gm) ?? [];
  const sectionCount = sectionMatches.length;
  const sectionScore = sectionCount >= 4 ? 25 : sectionCount >= 2 ? 15 : 5;

  // Depth score (0-20): avg sentences per section
  const sections = body.split(/^##\s+.+$/m).filter(Boolean);
  const nonIntroSections = sections.slice(1); // skip preamble before first section
  const avgSentences =
    nonIntroSections.length > 0
      ? nonIntroSections.reduce((sum, s) => sum + countSentences(s), 0) / nonIntroSections.length
      : 0;
  const depthScore = avgSentences >= 4 ? 20 : avgSentences >= 2 ? 12 : avgSentences >= 1 ? 6 : 2;

  // Technical score (0-15)
  const techMatches = body.match(TECH_RE) ?? [];
  const iocScore = Math.min(iocs.length, 3);
  const techScore = Math.min(techMatches.length * 2 + iocScore, 15);

  // References score (0-10)
  const refCount = (body.match(REF_RE) ?? []).length;
  const refScore = refCount >= 5 ? 10 : refCount >= 2 ? 5 : 0;

  // Filler penalty (0 to -10)
  let fillerCount = 0;
  for (const pat of FILLER_PATTERNS) {
    if (pat.test(body)) fillerCount++;
  }
  const fillerPenalty = -Math.min(fillerCount * 3, 10);

  const total = Math.max(
    0,
    Math.min(100, lengthScore + sectionScore + depthScore + techScore + refScore + fillerPenalty)
  );

  return {
    total,
    breakdown: {
      length: lengthScore,
      sections: sectionScore,
      depth: depthScore,
      technical: techScore,
      references: refScore,
      fillerPenalty,
    },
  };
}
