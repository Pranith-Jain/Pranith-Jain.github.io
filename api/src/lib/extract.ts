/**
 * Heuristic intel extractor.
 *
 * Pure function. Given `(title, body)` of a feed item / brief, returns the
 * entities a STIX `report` would reference:
 *   - iocs[]     — refanged + deduped + type-detected (ipv4/ipv6/domain/url/email/hash)
 *   - actors[]   — matched against `data/threat-actor-aliases.ts`
 *   - malware[]  — matched against `data/malware-dict.ts`
 *   - cves[]     — CVE-YYYY-NNNN[+] regex
 *   - tags[]     — matched theme keywords from `data/intel-keywords.ts`
 *   - summary    — first ~280 chars of the body, trimmed at a sentence break
 *
 * NO I/O. NO network. NO LLM. Cheap enough to run synchronously per-item.
 *
 * Defensive boundary (HARD): combolist-style `user:password` and
 * `email:password` tokens are NEVER captured as IoCs. The regex below
 * rejects any candidate that looks like a credential pair.
 */

import { detectType, refang, type IndicatorType } from './indicator';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { MALWARE_DICT } from '../data/malware-dict';
import { INTEL_KEYWORDS } from '../data/intel-keywords';

export interface ExtractedIoc {
  type: IndicatorType;
  value: string;
}

export interface ExtractedActor {
  slug: string;
  canonical: string;
  aliases: string[];
  mitreId?: string;
  /** Phrase from the source text that matched (debugging / UI tooltip). */
  matchedAs: string;
}

export interface ExtractedMalware {
  slug: string;
  canonical: string;
  aliases: string[];
  mitreId?: string;
  matchedAs: string;
}

export interface ExtractedCve {
  id: string;
}

export interface ExtractedEntities {
  iocs: ExtractedIoc[];
  actors: ExtractedActor[];
  malware: ExtractedMalware[];
  cves: ExtractedCve[];
  tags: string[];
  summary: string;
}

// ---------- IoC candidate extraction ----------
//
// Order matters: URLs before domains (a URL contains a domain), hashes before
// the long-hex catch-all. We work in two passes: refang the text, then run
// each candidate regex with a globalish flag.

const URL_CANDIDATE_RE = /\bh(?:t|x)t(?:p|x)s?:\/\/[^\s<>"')\]]+/gi;
const EMAIL_CANDIDATE_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const IPV4_CANDIDATE_RE = /\b(?:\d{1,3}[.[]+){3}\d{1,3}\b/g;
// `[0-9a-f]{0,4}` for the trailing groups so `2001:db8::1`-style zero-
// compression matches. The leading group still requires ≥1 hex char to
// keep \b anchoring deterministic.
const IPV6_CANDIDATE_RE = /\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}\b/gi;
const DOMAIN_CANDIDATE_RE = /\b(?:(?:[a-z0-9-]+)(?:\[\.\]|\.))+(?:[a-z]{2,24})\b/gi;
// Only canonical hash lengths: MD5, SHA-1, SHA-256, SHA-512. The old
// {32,128} range allowed 50-char-style false positives that the downstream
// detectType() would silently reject.
const HASH_CANDIDATE_RE = /\b(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{128})\b/gi;
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;
// Combolist guard. A credential pair looks like `username:password` where
// neither side is empty and neither side is purely hex / digits / colon
// (so we don't reject IPv6 `2001:db8::1` or hash:hash forms). Used only
// on candidates where we *don't* already know the type — URLs, emails,
// IPv4, IPv6, and hashes are exempt.
const COMBOLIST_RE = /^[^\s:]+:[^\s:]+$/;

const IGNORED_DOMAINS = new Set([
  // Schema / docs noise — extracting these as IoCs is always wrong.
  'example.com',
  'example.org',
  'example.net',
  'localhost.localdomain',
  // Common ATT&CK / report-template hosts.
  'attack.mitre.org',
  'mitre.org',
  // Cert publication / news-site footers — refining over time as needed.
]);

function dedupeStrings<T extends { value: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = it.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** Refang a single candidate (the full text refang would expand 'hxxp[s]'). */
function refangCandidate(raw: string): string {
  return refang(raw)
    .replace(/[,.;:!?\])>]+$/g, '') // trim trailing punctuation
    .trim();
}

/** Extract the host (lowercase) from a URL or email if recognisable. */
function extractHost(value: string, hint: 'url' | 'email'): string | null {
  try {
    if (hint === 'url') {
      const u = new URL(value);
      return u.hostname.toLowerCase();
    }
    const at = value.lastIndexOf('@');
    if (at < 0) return null;
    return value.slice(at + 1).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Extract IoCs from arbitrary text. Refangs defanged forms, dedupes
 * case-insensitively, classifies via `detectType()`. Returns a flat array.
 *
 * Domain-dedup rule: once a URL or email is captured we record its host
 * portion and SUPPRESS that exact host from the bare-domain pass. Previously
 * `https://evil.example/x` produced two IoCs (the URL + a separate `domain:
 * evil.example`) — confusing to the analyst and bloating the bundle. The
 * standalone host can still be added by appearing on its own elsewhere in
 * the text; we only suppress the redundant double-emit from the same span.
 */
export function extractIocs(text: string): ExtractedIoc[] {
  const refanged = refang(text);
  const found: ExtractedIoc[] = [];
  /** Hosts (lowercase) already consumed by a URL or email capture. */
  const consumedHosts = new Set<string>();

  const visit = (re: RegExp, hint: IndicatorType | null) => {
    const matches = refanged.match(re);
    if (!matches) return;
    for (const raw of matches) {
      const value = refangCandidate(raw);
      if (!value) continue;
      // Combolist guard: drop credential-pair shape `user:pass`. The new
      // regex is anchored end-to-end and forbids inner colons on either
      // side, so legitimate IPv6 (`2001:db8::1`) is NOT rejected.
      if (COMBOLIST_RE.test(value) && hint !== 'url' && hint !== 'email') continue;
      const type = hint ?? detectType(value);
      if (type === 'unknown') continue;
      if (type === 'domain' && IGNORED_DOMAINS.has(value.toLowerCase())) continue;
      // Skip a domain that we already emitted as the host of a URL/email.
      if (type === 'domain' && consumedHosts.has(value.toLowerCase())) continue;

      found.push({ type, value: type === 'hash' ? value.toLowerCase() : value });

      // Record host portion for the bare-domain pass to skip.
      if (type === 'url' || type === 'email') {
        const host = extractHost(value, type);
        if (host) consumedHosts.add(host);
      }
    }
  };

  // Order: URLs first (eat the domain inside), then emails, IPs, hashes, then
  // bare domains last. The consumedHosts set ensures the domain pass doesn't
  // re-emit hosts already captured as URL or email components.
  visit(URL_CANDIDATE_RE, 'url');
  visit(EMAIL_CANDIDATE_RE, 'email');
  visit(IPV4_CANDIDATE_RE, null); // re-validate via detectType to enforce 0-255 octet range
  visit(IPV6_CANDIDATE_RE, null);
  visit(HASH_CANDIDATE_RE, null);
  visit(DOMAIN_CANDIDATE_RE, null);

  return dedupeStrings(found);
}

export function extractCves(text: string): ExtractedCve[] {
  const seen = new Set<string>();
  const out: ExtractedCve[] = [];
  for (const m of text.match(CVE_RE) ?? []) {
    const id = m.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id });
  }
  return out;
}

// ---------- Dictionary matching (actors / malware / keywords) ----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a single combined regex per dictionary so we make one pass per
 * dictionary rather than N passes. Each alternative captures via named
 * groups (`?<slug>`) — not portable in older runtimes but supported in
 * modern V8 (Workers + Node 18+).
 */
function compileWordlist(words: { token: string; slug: string }[]): RegExp {
  // Sort longest-first to avoid 'APT' matching before 'APT28'.
  const sorted = [...words].sort((a, b) => b.token.length - a.token.length);
  const alts = sorted.map((w) => escapeRegex(w.token)).join('|');
  // Word-ish boundary: use lookarounds because some tokens have hyphens/spaces.
  // Allow leading/trailing punctuation or whitespace but not adjacent alpha.
  return new RegExp(`(?<![A-Za-z0-9])(?:${alts})(?![A-Za-z0-9])`, 'gi');
}

interface DictWord {
  token: string;
  slug: string;
}

function flatten<T extends { slug: string; canonical: string; aliases: string[] }>(dict: T[]): DictWord[] {
  const words: DictWord[] = [];
  for (const entry of dict) {
    words.push({ token: entry.canonical, slug: entry.slug });
    for (const a of entry.aliases) words.push({ token: a, slug: entry.slug });
  }
  return words;
}

const ACTOR_REGEX = compileWordlist(flatten(ACTOR_ALIASES));
const ACTOR_BY_SLUG = new Map(ACTOR_ALIASES.map((a) => [a.slug, a]));
const MALWARE_REGEX = compileWordlist(flatten(MALWARE_DICT));
const MALWARE_BY_SLUG = new Map(MALWARE_DICT.map((m) => [m.slug, m]));
const KEYWORD_REGEX = compileWordlist(
  flatten(
    INTEL_KEYWORDS.map((k) => ({
      slug: k.canonical, // canonical doubles as slug for keywords
      canonical: k.canonical,
      aliases: k.aliases,
    }))
  )
);

// Token→slug / token→keyword indices, built ONCE at module load. Replaces the
// per-match dictionary linear scan (findSlugFor / INTEL_KEYWORDS.find) that
// re-lowercased every alias on every matched token. First insertion wins,
// matching the prior first-match-in-dict-order semantics.
const ACTOR_TOKEN_MAP = new Map<string, string>();
for (const e of ACTOR_ALIASES) {
  for (const tok of [e.canonical, ...e.aliases]) {
    const k = tok.toLowerCase();
    if (!ACTOR_TOKEN_MAP.has(k)) ACTOR_TOKEN_MAP.set(k, e.slug);
  }
}
const MALWARE_TOKEN_MAP = new Map<string, string>();
for (const e of MALWARE_DICT) {
  for (const tok of [e.canonical, ...e.aliases]) {
    const k = tok.toLowerCase();
    if (!MALWARE_TOKEN_MAP.has(k)) MALWARE_TOKEN_MAP.set(k, e.slug);
  }
}
const KEYWORD_BY_LOWER = new Map<string, (typeof INTEL_KEYWORDS)[number]>();
for (const kw of INTEL_KEYWORDS) {
  for (const tok of [kw.canonical, ...kw.aliases]) {
    const k = tok.toLowerCase();
    if (!KEYWORD_BY_LOWER.has(k)) KEYWORD_BY_LOWER.set(k, kw);
  }
}

export function extractActors(text: string): ExtractedActor[] {
  const seen = new Map<string, ExtractedActor>();
  for (const m of text.match(ACTOR_REGEX) ?? []) {
    // O(1) token→slug lookup (index built once at module load).
    const hit = ACTOR_TOKEN_MAP.get(m.toLowerCase());
    if (!hit) continue;
    const actor = ACTOR_BY_SLUG.get(hit);
    if (!actor) continue;
    if (seen.has(actor.slug)) continue;
    seen.set(actor.slug, {
      slug: actor.slug,
      canonical: actor.canonical,
      aliases: actor.aliases,
      mitreId: actor.mitreId,
      matchedAs: m,
    });
  }
  return [...seen.values()];
}

export function extractMalware(text: string): ExtractedMalware[] {
  const seen = new Map<string, ExtractedMalware>();
  for (const m of text.match(MALWARE_REGEX) ?? []) {
    const hit = MALWARE_TOKEN_MAP.get(m.toLowerCase());
    if (!hit) continue;
    const fam = MALWARE_BY_SLUG.get(hit);
    if (!fam) continue;
    if (seen.has(fam.slug)) continue;
    seen.set(fam.slug, {
      slug: fam.slug,
      canonical: fam.canonical,
      aliases: fam.aliases,
      mitreId: fam.mitreId,
      matchedAs: m,
    });
  }
  return [...seen.values()];
}

export function extractTags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.match(KEYWORD_REGEX) ?? []) {
    const k = KEYWORD_BY_LOWER.get(m.toLowerCase());
    if (k) seen.add(k.canonical);
  }
  return [...seen];
}

// ---------- Summary ----------

const SENTENCE_END_RE = /[.!?]\s+|\s—\s|\n\n/;

export function makeSummary(body: string, maxChars = 280): string {
  const cleaned = body.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  // Trim to a sentence boundary that's within the cap, else hard-cut.
  const slice = cleaned.slice(0, maxChars);
  const m = slice.match(SENTENCE_END_RE);
  if (m && m.index !== undefined && m.index > maxChars * 0.4) {
    return slice.slice(0, m.index + 1).trim();
  }
  return slice.replace(/\s\S*$/, '').trim() + '…';
}

// ---------- Top-level extractor ----------

export function extract(title: string, body: string): ExtractedEntities {
  const text = `${title}\n\n${body}`;
  return {
    iocs: extractIocs(text),
    actors: extractActors(text),
    malware: extractMalware(text),
    cves: extractCves(text),
    tags: extractTags(text),
    summary: makeSummary(body),
  };
}
