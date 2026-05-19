import type { CaseStudyType, PostIOC, QualityScore, QaVerdict } from '../types';
import { requiredSections } from './templates';
import { EGREGIOUS_SLOP } from './copywriting';

// Preamble before the first ## heading is an intentional hook intro.
// No longer stripped. The system prompt explicitly instructs a hook paragraph.
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
  qa?: QaVerdict;
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
  'What is this vulnerability',
  'Affected products',
  'How it works',
  'How the attack works',
  'CVSS score breakdown',
  'CVSS breakdown',
  'Why this matters',
  'Why it matters',
  'Exploitation in the wild',
  'Detection & mitigation',
  'Detection and mitigation',
  'Detection & response',
  'Detection and response',
  'IOCs',
  'IOC',
  'Indicators of compromise',
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
    // `noUncheckedIndexedAccess` types lines[i] as string | undefined even
    // though the loop bound guarantees it; default to '' so the array ops
    // below stay string-typed without changing behavior.
    const line = lines[i] ?? '';
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      const sectionBody: string[] = [];
      i++;
      while (i < lines.length) {
        const cur = lines[i] ?? '';
        if (cur.startsWith('##')) break;
        sectionBody.push(cur);
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

/** Ensure a blank line before the closing bold paragraph when it follows a list
 *  (inside the References section). stripEmptySections removes blank lines, so
 *  this must run after it. */
function fixClosingBoldParagraph(body: string): string {
  return body.replace(/^(\s*(?:[-+*]|\d+\.)\s.+\n)(\*\*[^*]+\*\*)/gm, '$1\n$2');
}

export function postProcess(input: PostProcessInput): PostProcessOutput {
  const errors: string[] = [];

  let body = input.raw;
  // Step 1: Ensure section names have ## prefix
  body = ensureMdHeaders(body);
  // Step 2: Preamble before first ## heading is an intentional hook intro. Keep it.
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
  // Step 6: Ensure closing bold paragraph has a blank line before it (after list)
  body = fixClosingBoldParagraph(body);

  // Step 7: Deterministic AI-tell sanitisation. The model keeps emitting
  // em/en dashes despite the prompt; auto-replace (not between digits, so
  // numeric ranges survive) instead of failing the publish over it.
  body = body
    .replace(/(?<!\d)\s*[—–]\s*(?!\d)/g, ', ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*…\s*/g, '... ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Step 8: Egregious AI-slop guardrail. Prompt-level bans are routinely
  // ignored by the model, so enforce deterministically: an unambiguous slop
  // phrase makes the result non-ok, which triggers the one-shot repair pass
  // in generatePost (it does NOT permanently block — repair gets one go,
  // and the list is deliberately tight to avoid false positives).
  const slopHits = EGREGIOUS_SLOP.filter((re) => re.test(body)).map((re) => re.source.slice(0, 32));
  if (slopHits.length > 0) {
    errors.push(`ai-slop detected (rewrite): ${slopHits.join(' | ')}`);
  }

  if (!/^##\s/.test(body.trim())) {
    // Body may start with a hook paragraph. Check that ## sections exist somewhere.
    const sections = body.match(/^##\s+.+$/gm);
    if (!sections || sections.length === 0) {
      errors.push('output did not contain any section headers');
      return { ok: false, body, iocs: [], errors };
    }
  }

  for (const section of requiredSections(input.type)) {
    const heading = section.replace(/^##\s*/, '').toLowerCase();
    const found = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im').test(body);
    if (!found) errors.push(`missing section: ${section}`);
  }

  // CVE grounding. Citing a well-known historical CVE for *context* (e.g.
  // "unlike CVE-2021-44228 / Log4Shell") is normal security writing —
  // hard-failing the whole post for it was the dominant `publish_failed`
  // cause. Out-of-facts CVEs are now a non-blocking `warning:` (posts still
  // pass an admin-approval gate before publish). The prompt already forbids
  // inventing CVEs and instructs the model to mark historical ones as
  // context, so this stays informative without nuking valid drafts.
  const lowerFacts = input.factsText.toLowerCase();
  const bodyCves = Array.from(new Set((body.match(CVE_RE) ?? []).map((c) => c.toLowerCase())));
  for (const m of bodyCves) {
    if (!lowerFacts.includes(m)) errors.push(`warning: contextual CVE not in facts: ${m}`);
  }

  const iocs: PostIOC[] = [];
  const seen = new Set<string>();
  const add = (type: PostIOC['type'], value: string) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    iocs.push({ type, value });
  };
  // Domains that are sources/references or victims are NOT indicators of
  // compromise. Build an exclusion set:
  //  - every hostname that appears inside a URL in the facts (source/ref sites
  //    like ransomlook.io, and victim sites the source recorded), and
  //  - every domain-shaped token in the facts JSON (victim domains like
  //    defenseisready.com are stored verbatim in ransom evidence).
  // Then strip markdown link targets + bare URLs from the body before the
  // domain scan, so reference links never leak in as "IOCs".
  const stripHost = (h: string) => h.replace(/^www\./i, '').toLowerCase();
  const exclude = new Set<string>([
    'ransomlook.io',
    'ransomware.live',
    'ransomwatch.io',
    'ransom.wiki',
    'cisa.gov',
    'nvd.nist.gov',
    'github.com',
    'mitre.org',
    'attack.mitre.org',
    'example.com',
  ]);
  for (const u of input.factsText.match(/https?:\/\/([^/\s"'\\)]+)/gi) ?? []) {
    const host = /https?:\/\/([^/\s"'\\)]+)/i.exec(u)?.[1];
    if (host) exclude.add(stripHost(host));
  }
  for (const d of input.factsText.match(DOMAIN_RE) ?? []) exclude.add(stripHost(d));

  const bodyNoLinks = body
    .replace(/\[[^\]]*\]\(https?:\/\/[^)]+\)/g, ' ') // markdown links
    .replace(/https?:\/\/\S+/g, ' '); // bare URLs

  for (const m of bodyNoLinks.match(IPV4_RE) ?? []) add('ipv4', m);
  for (const m of bodyNoLinks.match(SHA256_RE) ?? []) add('sha256', m.toLowerCase());
  for (const m of bodyNoLinks.match(DOMAIN_RE) ?? []) {
    const host = stripHost(m);
    if (/^example\./i.test(host)) continue;
    if (exclude.has(host)) continue;
    // ransom posts: the body is victim names + the leak-site source. None of
    // those are IOCs. Skip domain extraction entirely for this type.
    if (input.type === 'ransom') continue;
    add('domain', host);
  }

  const quality = scoreQuality(body, iocs);

  // Content-QA verdict. Computed here but ADVISORY at this layer — `ok`
  // stays purely structural (so structural unit tests aren't coupled to
  // quality heuristics). The QA gate is ENFORCED one layer up in
  // generatePost, which gets a one-shot repair before a QA failure can
  // stop a publish.
  const qa = qaReview(body, iocs, input.type, quality);

  // Downgrade missing-section + `warning:`-prefixed entries to non-blocking.
  // Only genuine structural/integrity problems should fail a publish.
  const critical = errors.filter((e) => !e.startsWith('missing section:') && !e.startsWith('warning:'));

  return { ok: critical.length === 0, body, iocs, errors, quality, qa };
}

/**
 * Deterministic content-QA. Cheap, no extra AI call. Fails only genuinely
 * sub-standard output so it doesn't reintroduce publish_failed on good
 * drafts: a low composite score, a too-thin body, no real sections, zero
 * citations, or a sentence hammered 3+ times (the "patch immediately"
 * repetition this engine was prone to).
 */
const QA_MIN_SCORE = 45;
// Only a truly-broken/truncated body floor — NOT a length mandate. A high
// minimum would push the model to pad, which is the AI-slop behaviour the
// voice identity explicitly fights. Real length nuance lives in
// scoreQuality()/QA_MIN_SCORE; a terse, substantive post is good.
const QA_MIN_WORDS = 160;

export function qaReview(body: string, iocs: PostIOC[], _type: CaseStudyType, quality: QualityScore): QaVerdict {
  const issues: string[] = [];

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < QA_MIN_WORDS) issues.push(`too thin (${words} words < ${QA_MIN_WORDS})`);

  const sectionCount = (body.match(/^##\s+.+/gm) ?? []).length;
  if (sectionCount < 2) issues.push(`only ${sectionCount} section heading(s)`);

  const hasRefs = /^##\s+references/im.test(body);
  const linkCount = (body.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? []).length;
  if (!hasRefs && linkCount === 0 && iocs.length === 0) {
    issues.push('no References section, citations, or IOCs — uncorroborated');
  }

  // Repetition: a normalised sentence (>24 chars) repeated 3+ times.
  const norm = body
    .replace(/^##.*$/gm, ' ')
    .replace(/[*_`>#-]/g, ' ')
    .toLowerCase();
  const counts = new Map<string, number>();
  for (const raw of norm.split(/[.!?\n]+/)) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (s.length < 25) continue;
    const n = (counts.get(s) ?? 0) + 1;
    counts.set(s, n);
    if (n === 3) issues.push(`repeated sentence ×3: "${s.slice(0, 60)}…"`);
  }

  if (quality.total < QA_MIN_SCORE) issues.push(`quality score ${quality.total} < ${QA_MIN_SCORE}`);

  return { passed: issues.length === 0, score: quality.total, issues };
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
