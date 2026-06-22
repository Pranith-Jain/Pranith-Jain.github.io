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
  'TL;DR',
  'FAQ',
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
        result.push('');
        result.push(...sectionBody);
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

/** Strip reference bullets whose URL is a placeholder/example.com domain. */
function stripPlaceholderRefs(body: string): string {
  const refLine = /^(\s*[-*+]\s*)\[([^\]]+)\]\(([^)]+)\)([^\n]*)\n?/gm;
  return body
    .replace(refLine, (match, _bullet, _label, url) => {
      const host = hostOf(String(url));
      if (host && isPlaceholderDomain(host)) return '';
      return match;
    })
    .replace(/^(\s*[-*+]\s*)https?:\/\/example\.\w+[^\n]*\n?/gm, '');
}

/**
 * Curated allowlist of hosts that may appear in a ## References bullet.
 * Anything else gets stripped — this defends against the model inventing
 * citation URLs (the most common hallucination class on security writing).
 *
 * The list is the union of: canonical authorities (NVD, KEV, MITRE, CVSS),
 * widely-cited vendor labs / news outlets, and the upstream feeds the
 * discovery runners themselves use. We do NOT auto-allow every hostname
 * that appears in the candidate's source URLs (those are added separately
 * per-post in postProcess), so a one-off source for THIS post stays valid
 * even if it's not in this static list.
 */
const REFERENCE_HOST_ALLOWLIST = new Set<string>([
  // Canonical authorities
  'nvd.nist.gov',
  'cisa.gov',
  'www.cisa.gov',
  'attack.mitre.org',
  'cve.mitre.org',
  'cve.org',
  'www.cve.org',
  'first.org',
  'www.first.org',
  // Ransomware tracking + dark-web intel
  'ransomlook.io',
  'www.ransomlook.io',
  'ransomware.live',
  'ransomwatch.io',
  'ransom.wiki',
  // abuse.ch family
  'abuse.ch',
  'threatfox.abuse.ch',
  'urlhaus.abuse.ch',
  'bazaar.abuse.ch',
  // Vendor / research labs
  'unit42.paloaltonetworks.com',
  'sentinelone.com',
  'sentinelone.labs',
  'sentinellabs.com',
  'mandiant.com',
  'cloud.google.com',
  'research.checkpoint.com',
  'huntress.com',
  'crowdstrike.com',
  'sygnia.co',
  'sophos.com',
  'news.sophos.com',
  'microsoft.com',
  'www.microsoft.com',
  'cisco.com',
  'blog.talosintelligence.com',
  'talosintelligence.com',
  'fortinet.com',
  'kaspersky.com',
  'securelist.com',
  'eset.com',
  'welivesecurity.com',
  'tenable.com',
  'rapid7.com',
  'redcanary.com',
  'snyk.io',
  // Security news / write-ups
  'krebsonsecurity.com',
  'bleepingcomputer.com',
  'www.bleepingcomputer.com',
  'therecord.media',
  'thehackernews.com',
  'hackread.com',
  'theregister.com',
  'arstechnica.com',
  'wired.com',
  'reuters.com',
  // Breach / OSINT references
  'haveibeenpwned.com',
  'hudsonrock.com',
  'shodan.io',
  'censys.io',
  'virustotal.com',
  'www.virustotal.com',
  'otx.alienvault.com',
  'urlscan.io',
  // Standards bodies
  'nist.gov',
  'csrc.nist.gov',
  'iana.org',
  'ietf.org',
  'datatracker.ietf.org',
  // Public AI/ML security
  'owasp.org',
  'genai.owasp.org',
  'atlas.mitre.org',
  // Generic high-trust
  'github.com',
  'gist.github.com',
]);

/**
 * Curated map of recognised publisher labels → canonical source URL.
 * Used by `linkifyPlainTextRefs()` to auto-fix the common "model wrote
 * the label but no URL" failure mode: a draft that says
 *   1. BleepingComputer, initial breach disclosure with record count estimate.
 *   2. The Hacker News, follow‑up article confirming credit‑card exposure.
 * is rewritten in‑place to
 *   - [BleepingComputer, initial breach disclosure with record count estimate.](https://www.bleepingcomputer.com/news/security/...)
 *
 * The URL is just the canonical homepage (e.g. /news/security/ for BleepingComputer)
 * — the model is supposed to add the article slug on the next pass via
 * the repair loop, but at minimum the reader gets a clickable link instead
 * of a wall of plain text. If the label isn't in the map, the bullet
 * stays plain text and the QA gate flags it for a manual fix.
 */
const KNOWN_PUBLISHER_URLS: ReadonlyArray<{ labelRe: RegExp; host: string; path: string; label: string }> = [
  {
    labelRe: /bleeping\s*computer/i,
    host: 'www.bleepingcomputer.com',
    path: '/news/security/',
    label: 'BleepingComputer',
  },
  { labelRe: /the\s+hacker\s+news/i, host: 'thehackernews.com', path: '/', label: 'The Hacker News' },
  { labelRe: /the\s+record(,|\s|$)/i, host: 'therecord.media', path: '/', label: 'The Record' },
  { labelRe: /dark\s*reading/i, host: 'www.darkreading.com', path: '/', label: 'Dark Reading' },
  { labelRe: /securityweek/i, host: 'www.securityweek.com', path: '/', label: 'SecurityWeek' },
  { labelRe: /cyber\s*scoop/i, host: 'cyberscoop.com', path: '/', label: 'CyberScoop' },
  {
    labelRe: /krebsonsecurity|krebs\s+on\s+security/i,
    host: 'krebsonsecurity.com',
    path: '/',
    label: 'Krebs on Security',
  },
  { labelRe: /help\s*net\s*security/i, host: 'www.helpnetsecurity.com', path: '/', label: 'Help Net Security' },
  { labelRe: /threatpost/i, host: 'threatpost.com', path: '/', label: 'Threatpost' },
  { labelRe: /\bzdnet\b/i, host: 'www.zdnet.com', path: '/topic/security/', label: 'ZDNet' },
  {
    labelRe: /infosecurity\s*magazine/i,
    host: 'www.infosecurity-magazine.com',
    path: '/news/',
    label: 'Infosecurity Magazine',
  },
  { labelRe: /cso\s*online/i, host: 'www.csoonline.com', path: '/', label: 'CSO Online' },
  { labelRe: /sc\s*magazine|scmagazine/i, host: 'www.scmagazine.com', path: '/', label: 'SC Magazine' },
  { labelRe: /the\s*register/i, host: 'www.theregister.com', path: '/Security/', label: 'The Register' },
  { labelRe: /ars\s*technica/i, host: 'arstechnica.com', path: '/security/', label: 'Ars Technica' },
  { labelRe: /wired/i, host: 'www.wired.com', path: '/security/', label: 'Wired' },
  { labelRe: /reuters/i, host: 'www.reuters.com', path: '/technology/', label: 'Reuters' },
  { labelRe: /hackread/i, host: 'www.hackread.com', path: '/', label: 'Hackread' },
  { labelRe: /nvd|cve\s+details/i, host: 'nvd.nist.gov', path: '/vuln/detail/', label: 'NVD' },
  {
    labelRe: /cisa\s+kev|cisa\s+known/i,
    host: 'www.cisa.gov',
    path: '/known-exploited-vulnerabilities-catalog',
    label: 'CISA KEV',
  },
  { labelRe: /mitre\s+att&ck|att&ck\s+matrix/i, host: 'attack.mitre.org', path: '/', label: 'MITRE ATT&CK' },
];

/**
 * Detect plain-text reference bullets under `## References` (model wrote
 * "BleepingComputer, initial disclosure" with no URL) and linkify the ones
 * whose label matches a known publisher. Returns
 * { body, fixedCount, unlinkedCount } so the caller can decide whether to
 * fail QA when too many unlinked bullets remain.
 */
function linkifyPlainTextRefs(body: string): { body: string; fixedCount: number; unlinkedCount: number } {
  // Extract the ## References block by slicing: find the heading index,
  // then take everything up to the next `##` heading or end-of-string.
  // A pure-regex approach with lookaheads is fragile when the section is
  // the LAST block in the body (the "\s*$" end-anchor races with the
  // "\n##\s+" start-anchor on adjacent matches). Slicing by index is
  // unambiguous and O(n) in the section size.
  const refsStart = body.search(/^##\s+References\b/im);
  if (refsStart < 0) return { body, fixedCount: 0, unlinkedCount: 0 };
  const afterStart = body.slice(refsStart + 1);
  const nextHeading = afterStart.match(/\n##\s+/);
  const refsEnd = nextHeading ? refsStart + 1 + nextHeading.index! : body.length;
  const refsBlock = body.slice(refsStart, refsEnd);

  // Two unlinked patterns the model actually emits:
  //   1. Numbered:  "1. BleepingComputer, initial disclosure with X."
  //   2. Bulleted:  "- BleepingComputer, initial disclosure with X."
  // Both must NOT already contain [..](https?://) on the same line.
  const lineRe = /^(\s*(?:[-*+]|\d+\.)\s+)(?!\[)([^\n]*?)(?=\s*$)/gm;
  let fixedCount = 0;
  let unlinkedCount = 0;
  const replaced = refsBlock.replace(lineRe, (match, bullet, text) => {
    if (/\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(match)) return match;
    const trimmed = text.trim();
    if (trimmed.length < 8) return match;
    for (const p of KNOWN_PUBLISHER_URLS) {
      if (p.labelRe.test(trimmed)) {
        fixedCount += 1;
        return `${bullet}[${trimmed}](https://${p.host}${p.path})`;
      }
    }
    unlinkedCount += 1;
    return match;
  });

  return {
    body: body.slice(0, refsStart) + replaced + body.slice(refsEnd),
    fixedCount,
    unlinkedCount,
  };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Strip ## References bullets whose host is neither in the static
 * allowlist nor in the per-post source hostnames extracted from the
 * factsText. Defends against the model fabricating citation URLs.
 *
 * One escape hatch: if removing references would empty the section we
 * stop short (better an over-broad citation than no citations at all,
 * which would cause QA to fail the post for being unsourced).
 */
function stripDisallowedRefs(body: string, factsText: string): string {
  const refsIdx = body.search(/^##\s+References\b/im);
  if (refsIdx < 0) return body;
  const bodyText = body.slice(0, refsIdx);
  const refsText = body.slice(refsIdx);

  // Extract every hostname mentioned in the candidate's factsText so a
  // legitimate per-post source survives even if it isn't in the static
  // list. Includes bare URLs and markdown-wrapped URLs.
  const factHosts = new Set<string>();
  for (const m of factsText.match(/https?:\/\/[^\s)"']+/gi) ?? []) {
    const h = hostOf(m);
    if (h) factHosts.add(h);
  }

  let kept = 0;
  let dropped = 0;
  let anyNonPlaceholderDropped = false;
  const refLine = /^(\s*[-*+]\s*)\[([^\]]+)\]\(([^)]+)\)([^\n]*)\n?/gm;
  const filtered = refsText.replace(refLine, (match, _bullet, _label, url) => {
    const host = hostOf(String(url));
    if (!host) {
      dropped += 1;
      anyNonPlaceholderDropped = true;
      return '';
    }
    const bare = host.replace(/^www\./, '');
    if (
      REFERENCE_HOST_ALLOWLIST.has(host) ||
      REFERENCE_HOST_ALLOWLIST.has(bare) ||
      factHosts.has(host) ||
      factHosts.has(bare)
    ) {
      kept += 1;
      return match;
    }
    if (!isPlaceholderDomain(host)) anyNonPlaceholderDropped = true;
    dropped += 1;
    return '';
  });

  // Safety: if our filter would empty the References section entirely,
  // back off — leave the original list. An over-eager filter could
  // remove every reference on a topic whose canonical sources we haven't
  // enumerated yet, and an empty References section trips QA.
  // Exception: do NOT back off when ALL dropped references are placeholder
  // domains — those are invented by the model and should never survive.
  if (kept === 0 && dropped > 0 && anyNonPlaceholderDropped) return body;
  return bodyText + filtered;
}

/**
 * Sanity-filter for IOCs extracted from a generated post. Placeholder /
 * reserved values that the LLM tends to invent ("192.168.1.1" as a C2
 * IP, "0123…789abc" as a hash) get dropped before they reach KV. This
 * is layer-1 truth defence — a future layer-2 would cross-check live
 * threat-intel APIs (VT/Censys). Layer-1 alone catches the obvious cases.
 */
function isPlaceholderIp(ip: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if ([a, b, c, d].some((n) => n < 0 || n > 255)) return true;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved
  // 192.0.0.0/24 special-use, 198.18.0.0/15 benchmark, 240/4 reserved
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && b >= 18 && b <= 19) return true;
  return false;
}

function isPlaceholderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (d === 'localhost') return true;
  if (/^example\.(com|net|org|test|local|edu)$/.test(d)) return true;
  if (/\.(test|local|invalid|example|localhost)$/.test(d)) return true;
  if (/^(www\.)?(example|test|placeholder|sample|dummy|foobar|fake)\./.test(d)) return true;
  return false;
}

function isPlaceholderHash(hash: string): boolean {
  const h = hash.toLowerCase();
  // SHA-256: 64 hex chars. Reject all-same-char strings (0000…, ffff…,
  // dead-beef-style obviously fake patterns).
  if (/^([0-9a-f])\1{63}$/.test(h)) return true;
  if (/^(deadbeef|cafebabe|baadf00d|feedface|abad1dea)/i.test(h)) return true;
  // Repeating short patterns ("123456789abcdef…" or "01234567…" lookalikes)
  if (/^(0123456789abcdef){4}$/.test(h)) return true;
  return false;
}

/**
 * Drop canonical-authority references (NVD, CISA KEV, MITRE ATT&CK) from
 * the References section when they are clearly being used as filler — a
 * bare home-page URL with no specific CVE / technique / entry behind it,
 * AND the body never cites that source's content either.
 *
 * A reference is KEPT when EITHER of these holds:
 *   - The URL itself is a specific deep-link (NVD CVE record, KEV CVE
 *     entry, ATT&CK technique page). The URL alone proves a real citation.
 *   - The body mentions material from that source (a CVE id, the word
 *     "KEV"/"actively exploited", or an ATT&CK T-code).
 *
 * Only when BOTH the URL is bare AND the body is empty of evidence do we
 * strip the bullet. This avoids regressing tests where the body cites
 * the CVE only via the reference URL deep-link.
 */
function stripUnusedCanonicalRefs(body: string): string {
  const refsIdx = body.search(/^##\s+References\b/im);
  if (refsIdx < 0) return body;
  const bodyText = body.slice(0, refsIdx);
  const refsText = body.slice(refsIdx);

  const hasCveInBody = /\bCVE-\d{4}-\d{4,7}\b/i.test(bodyText);
  const hasKevInBody = /\b(KEV|known\s*exploited|actively\s*exploited)\b/i.test(bodyText);
  const hasAttackInBody = /\bT\d{4}(?:\.\d{3})?\b/.test(bodyText);

  const refLine = /^(\s*[-*+]\s*)\[([^\]]+)\]\(([^)]+)\)([^\n]*)\n?/gm;

  const cleanedRefs = refsText.replace(refLine, (match, _bullet, label, url) => {
    const labelLc = String(label).toLowerCase();
    const urlLc = String(url).toLowerCase();

    const isNvd = /\bnvd\b/.test(labelLc) || urlLc.includes('nvd.nist.gov');
    const isKev = labelLc.includes('cisa kev') || labelLc.includes('kev') || urlLc.includes('known-exploited');
    const isAttack = labelLc.includes('mitre att') || urlLc.includes('attack.mitre.org');

    // Deep-link detection: the URL itself proves a real citation.
    const urlHasCve = /\bcve-\d{4}-\d{4,7}\b/i.test(urlLc);
    const urlHasAttackTech = /attack\.mitre\.org\/techniques\/t\d{4}/i.test(urlLc);

    if (isNvd && !hasCveInBody && !urlHasCve) return '';
    if (isKev && !hasKevInBody && !urlHasCve) return '';
    if (isAttack && !hasAttackInBody && !urlHasAttackTech) return '';
    return match;
  });

  return bodyText + cleanedRefs;
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
  // Step 3a.1: Prune NVD / KEV / MITRE references that the body doesn't
  // actually use — defensive against the model dropping them in as filler.
  body = stripUnusedCanonicalRefs(body);
  // Step 3a.2: Drop references whose host is neither in the static
  // allowlist nor in the candidate's source URLs. Defends against the
  // model fabricating citation domains (the most common hallucination
  // mode on security writing). Backs off if it would empty the section.
  body = stripDisallowedRefs(body, input.factsText);
  // Step 3a.3: Linkify plain-text reference bullets whose label matches a
  // known publisher (BleepingComputer, The Hacker News, Krebs, ...). The
  // model frequently writes "1. BleepingComputer, initial disclosure." with
  // no URL — that bullet is uncorroborated and would slip past QA because
  // the linkCount check only triggers when there are ZERO links anywhere.
  // Auto-fixing the recognised labels gives the reader a clickable link to
  // the publisher's homepage; the unlinkedCount is forwarded to QA so an
  // unrecognised label still fails the post.
  const linkify = linkifyPlainTextRefs(body);
  body = linkify.body;
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

  for (const m of bodyNoLinks.match(IPV4_RE) ?? []) {
    if (isPlaceholderIp(m)) continue;
    add('ipv4', m);
  }
  for (const m of bodyNoLinks.match(SHA256_RE) ?? []) {
    const h = m.toLowerCase();
    if (isPlaceholderHash(h)) continue;
    add('sha256', h);
  }
  for (const m of bodyNoLinks.match(DOMAIN_RE) ?? []) {
    const host = stripHost(m);
    if (isPlaceholderDomain(host)) continue;
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
  // Unlinked reference bullets are a stronger signal than the check above.
  // A draft that says "1. BleepingComputer, initial disclosure." with no URL
  // IS a citation, but the reader cannot click through — so it's a fail
  // even when the count of linkCount > 0 elsewhere in the body. The
  // linkifyPlainTextRefs() pass above attempts to auto-fix recognised
  // publishers; anything left unlinked is a real model failure.
  // Unlinked reference bullets. A bullet is "unlinked" if it looks like
  // a list item (`- …` or `1. …`) but has no `[label](https://…)`.
  //
  // Strict-mode (linkifyPlainTextRefs ran first and fixed everything it
  // recognised) — only the bullets the model invented from scratch
  // (e.g. fictional "Internal SOC Logs" reference) survive. The linkify
  // map is conservative: a real-but-unrecognised publisher (a niche
  // research blog, a regional CERT) shouldn't block the post. So we
  // only QA-fail when MAJORITY of bullets are unlinked — a 1/2
  // unlinked ratio is much less bad than 5/5, and reflects "the model
  // cited one novel source" rather than "the model can't cite".
  const refsAudit = (() => {
    const rStart = body.search(/^##\s+References\b/im);
    if (rStart < 0) return { total: 0, unlinked: 0 };
    const afterStart = body.slice(rStart + 1);
    const next = afterStart.match(/\n##\s+/);
    const rEnd = next ? rStart + 1 + next.index! : body.length;
    const refsBody = body.slice(rStart, rEnd);
    const lines = refsBody.split(/\r?\n/);
    let total = 0;
    let unlinked = 0;
    for (const ln of lines) {
      if (!/^\s*(?:[-*+]|\d+\.)\s+/.test(ln)) continue;
      if (ln.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim().length < 8) continue;
      total += 1;
      if (!/\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(ln)) unlinked += 1;
    }
    return { total, unlinked };
  })();
  if (refsAudit.total > 0 && refsAudit.unlinked > refsAudit.total / 2) {
    issues.push(
      `${refsAudit.unlinked}/${refsAudit.total} reference bullets have no URL — the majority of citations are unclickable`
    );
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
  const lengthScore = wordCount >= 800 && wordCount <= 1200 ? 30 : wordCount >= 500 && wordCount <= 1500 ? 20 : 10;

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
