/**
 * Deterministic (regex-based) observable extractor — zero AI, zero deps.
 *
 * Complements the AI-based IOC extraction in routes/ioc-extraction.ts: this
 * module is fast, reproducible, and free to call on every report. Extraction
 * runs on a refanged copy of the input while `context` snippets are cut from
 * the ORIGINAL text (via an offset map), so analysts still see the defanged
 * form as it appeared in the source.
 *
 * Pipeline:
 *   1. Refang pass      — hXXp → http, [.]/(dot) inside hosts, [at] in emails,
 *                         [:] after schemes. Counts replacements.
 *   2. Candidate scan   — one targeted regex per observable type.
 *   3. Overlap resolve  — priority order (url > email > registry > mutex >
 *                         paths > ip > hashes > cve > crypto > domain); a
 *                         candidate overlapping an accepted hit is dropped,
 *                         which is also what keeps URL/email hosts from
 *                         double-emitting as standalone domains.
 *   4. Dedupe + cap     — first occurrence wins, sorted by index, capped at
 *                         maxHits with `truncated` set.
 */

export type ObservableType =
  | 'ipv4'
  | 'ipv6'
  | 'domain'
  | 'url'
  | 'email'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'cve'
  | 'mutex'
  | 'registry_key'
  | 'file_path_windows'
  | 'file_path_unix'
  | 'btc_address'
  | 'eth_address'
  | 'xmr_address';

export const OBSERVABLE_TYPES: readonly ObservableType[] = [
  'ipv4',
  'ipv6',
  'domain',
  'url',
  'email',
  'md5',
  'sha1',
  'sha256',
  'cve',
  'mutex',
  'registry_key',
  'file_path_windows',
  'file_path_unix',
  'btc_address',
  'eth_address',
  'xmr_address',
];

export interface ObservableHit {
  type: ObservableType;
  value: string;
  index: number;
  context?: string;
}

export interface ExtractObservablesOptions {
  /** Max observables returned (default 2000). Extra unique hits set `truncated`. */
  maxHits?: number;
  /** Chars of surrounding original text per hit (default 40; 0 disables context). */
  contextChars?: number;
  /**
   * When true (default) a matched URL suppresses a separate domain hit for
   * its host. Set false to also emit the bare host as its own domain.
   */
  dedupeUrlHosts?: boolean;
}

export interface ExtractObservablesResult {
  counts: Record<string, number>;
  observables: ObservableHit[];
  refangedCount: number;
  truncated?: boolean;
}

interface RefangResult {
  text: string;
  count: number;
  /** Per-char map: refanged index → original index. */
  map: Uint32Array;
}

interface Candidate {
  type: ObservableType;
  start: number;
  end: number;
  value: string;
}

const isAlnum = (ch: string): boolean => /[A-Za-z0-9]/.test(ch);

/**
 * Single left-to-right scan that rewrites common defanging markers while
 * tracking an output→input offset map so contexts can be cut from the raw
 * source. Markers are only expanded when flanked by characters that make
 * sense for a host/email, so prose like "see (at) figure 3" is untouched.
 */
function refangInternal(original: string): RefangResult {
  const out: string[] = [];
  const srcs: number[] = [];
  let count = 0;
  let i = 0;
  const n = original.length;

  const push = (chunk: string, src: number) => {
    out.push(chunk);
    srcs.push(src);
    if (chunk.length > 1) {
      // Multi-char chunks ('http') need one entry per char.
      for (let k = 1; k < chunk.length; k++) srcs.push(src);
    }
  };

  while (i < n) {
    const prev = i > 0 ? original.charAt(i - 1) : '';
    const c0 = original.charAt(i);
    const c1 = original.charAt(i + 1);
    const c2 = original.charAt(i + 2);
    const c3 = original.charAt(i + 3);
    const c4 = original.charAt(i + 4);
    const low0 = c0.toLowerCase();

    // hxxp / hXxp / HXXp… followed by : or / — also hxxps → https
    if (low0 === 'h' && c1.toLowerCase() === 'x' && c2.toLowerCase() === 'x' && c3.toLowerCase() === 'p') {
      const c5 = original.charAt(i + 5);
      if (c4 === ':' || c4 === '/') {
        push('http', i);
        i += 4;
        count++;
        continue;
      }
      if ((c4 === 's' || c4 === 'S') && (c5 === ':' || c5 === '/')) {
        push('https', i);
        i += 5;
        count++;
        continue;
      }
    }

    // [:] after scheme letters or before slashes — http[:]//host
    if (c0 === '[' && c1 === ':' && c2 === ']' && (/[A-Za-z]/.test(prev) || c3 === '/')) {
      push(':', i);
      i += 3;
      count++;
      continue;
    }

    // Bracketed single dots between host labels — evil[.]com / evil(.)com / evil{.}com
    if ('[({'.includes(c0) && c1 === '.' && '])}'.includes(c2) && /[A-Za-z0-9_-]/.test(prev) && isAlnum(c3)) {
      push('.', i);
      i += 3;
      count++;
      continue;
    }

    // Bracketed @ in emails — a[@]b / a{@}b / a(@)b
    if ('[({'.includes(c0) && c1 === '@' && '])}'.includes(c2) && /[A-Za-z0-9._%+-]/.test(prev) && isAlnum(c3)) {
      push('@', i);
      i += 3;
      count++;
      continue;
    }

    // Short at-forms — admin[at]corp / admin(at)corp / admin{at}corp
    if (
      '[({'.includes(c0) &&
      (c1 === 'a' || c1 === 'A') &&
      (c2 === 't' || c2 === 'T') &&
      '])}'.includes(c3) &&
      /[A-Za-z0-9._%+-]/.test(prev) &&
      isAlnum(original.charAt(i + 4))
    ) {
      push('@', i);
      i += 4;
      count++;
      continue;
    }

    // Word-form markers — [dot] (dot) {dot}, case-insensitive.
    // slice(i+1, i+4) yields 'dot'; the closing bracket sits at i+4.
    if ((c0 === '[' || c0 === '(' || c0 === '{') && (c4 === ']' || c4 === ')' || c4 === '}')) {
      const mid = original.slice(i + 1, i + 4).toLowerCase();
      if (mid === 'dot' && /[A-Za-z0-9_-]/.test(prev) && isAlnum(original.charAt(i + 5))) {
        push('.', i);
        i += 5;
        count++;
        continue;
      }
    }

    push(c0, i);
    i++;
  }

  return { text: out.join(''), count, map: Uint32Array.from(srcs) };
}

/** Refang defanged observables without extracting. Public helper for `refangOnly`. */
export function refangDefanged(text: string): { text: string; count: number } {
  const r = refangInternal(text);
  return { text: r.text, count: r.count };
}

// ─── Trailing punctuation helpers ─────────────────────────────────────────

const TRAIL_PUNCT = '.,;:!?"\'';

/** Strip trailing punctuation; drop unbalanced closing brackets/parens. */
function stripTrailing(value: string): string {
  let s = value;
  for (;;) {
    const last = s.charAt(s.length - 1);
    if (TRAIL_PUNCT.includes(last)) {
      s = s.slice(0, -1);
      continue;
    }
    if (last === ')' && !s.includes('(')) {
      s = s.slice(0, -1);
      continue;
    }
    if (last === ']' && !s.includes('[')) {
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return s;
}

function stripTrailingSlashes(value: string): string {
  let s = stripTrailing(value);
  while (s.endsWith('/') || s.endsWith('\\')) s = s.slice(0, -1);
  return s;
}

// ─── Candidate scanners ───────────────────────────────────────────────────

const URL_RE = /\b(?:https?|ftp):\/\/[^\s"'<>`]+/gi;

function scanUrls(text: string): Candidate[] {
  const hits: Candidate[] = [];
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    const value = stripTrailing(m[0]);
    if (value.length > 8) hits.push({ type: 'url', start: m.index, end: m.index + value.length, value });
  }
  return hits;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/gi;

function scanEmails(text: string): Candidate[] {
  const hits: Candidate[] = [];
  EMAIL_RE.lastIndex = 0;
  for (let m = EMAIL_RE.exec(text); m; m = EMAIL_RE.exec(text)) {
    let v = m[0];
    while (v.startsWith('.')) v = v.slice(1);
    v = stripTrailing(v);
    // Label hygiene: no leading/trailing hyphens, no empty labels.
    const domain = v.split('@')[1] ?? '';
    const labels = domain.split('.');
    if (!v.includes('@')) continue;
    if (labels.some((l) => l.length === 0 || l.startsWith('-') || l.endsWith('-'))) continue;
    hits.push({ type: 'email', start: m.index, end: m.index + v.length, value: v });
  }
  return hits;
}

const IPV4_RE = /(?:^|[^\w.])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?![\w.])/g;

function octetOk(o: string): boolean {
  if (!/^\d{1,3}$/.test(o)) return false;
  return parseInt(o, 10) <= 255;
}

function scanIpv4(text: string): Candidate[] {
  const hits: Candidate[] = [];
  IPV4_RE.lastIndex = 0;
  for (let m = IPV4_RE.exec(text); m; m = IPV4_RE.exec(text)) {
    const ip = m[1];
    if (!ip) continue;
    const parts = ip.split('.');
    if (!parts.every(octetOk)) continue;
    const start = m.index + (m[0].length - ip.length);
    hits.push({ type: 'ipv4', start, end: start + ip.length, value: ip });
  }
  return hits;
}

/** Structural IPv6 validation: groups of ≤4 hex, ≤1 "::", ≤8 groups total. */
export function isValidIpv6(addr: string): boolean {
  if (addr.length < 2 || !addr.includes(':')) return false;
  if ((addr.match(/::/g) ?? []).length > 1) return false;
  let headPart = addr;
  let tailPart = '';
  if (addr.includes('::')) {
    const idx = addr.indexOf('::');
    headPart = addr.slice(0, idx);
    tailPart = addr.slice(idx + 2);
  }
  const headGroups = headPart ? headPart.split(':') : [];
  const tailGroups = tailPart ? tailPart.split(':') : [];
  if (!headPart && !tailPart && !addr.includes('::')) return false;
  if (addr.includes('::')) {
    if (headGroups.length + tailGroups.length > 7) return false;
  } else if (headGroups.length !== 8) {
    return false;
  }
  for (const g of [...headGroups, ...tailGroups]) {
    if (!/^[A-Fa-f0-9]{1,4}$/.test(g)) return false;
  }
  return true;
}

const IPV6_RUN_RE = /[A-Fa-f0-9]*:[A-Fa-f0-9:]*[A-Fa-f0-9]/g;

function scanIpv6(text: string): Candidate[] {
  const hits: Candidate[] = [];
  IPV6_RUN_RE.lastIndex = 0;
  for (let m = IPV6_RUN_RE.exec(text); m; m = IPV6_RUN_RE.exec(text)) {
    const run = m[0];
    if (!run.includes(':')) continue;
    // Skip runs glued to an IPv4 continuation (::ffff:192.168.x.x) so we
    // don't emit a truncated bogus address next to the real ipv4 hit.
    const afterDot = text.charAt(m.index + run.length) === '.';
    if (afterDot && isAlnum(text.charAt(m.index + run.length + 1))) continue;
    if (!isValidIpv6(run)) continue;
    hits.push({ type: 'ipv6', start: m.index, end: m.index + run.length, value: run });
  }
  return hits;
}

const DOMAIN_RE =
  /(?:^|[^A-Za-z0-9@.\-_])((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24})(?![A-Za-z0-9-])/g;

function isValidDomain(v: string): boolean {
  if (v.length < 4 || v.length > 253) return false;
  const labels = v.split('.');
  if (labels.length < 2) return false;
  return labels.every((l) => l.length >= 1 && l.length <= 63 && !l.startsWith('-') && !l.endsWith('-'));
}

function scanDomains(text: string): Candidate[] {
  const hits: Candidate[] = [];
  DOMAIN_RE.lastIndex = 0;
  for (let m = DOMAIN_RE.exec(text); m; m = DOMAIN_RE.exec(text)) {
    const raw = m[1];
    if (!raw) continue;
    const value = raw.replace(/\.+$/, '');
    if (!isValidDomain(value)) continue;
    const start = m.index + (m[0].length - raw.length);
    hits.push({ type: 'domain', start, end: start + raw.length, value });
  }
  return hits;
}

const HASH_RE = /\b(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})\b/gi;

function scanHashes(text: string): Candidate[] {
  const hits: Candidate[] = [];
  HASH_RE.lastIndex = 0;
  for (let m = HASH_RE.exec(text); m; m = HASH_RE.exec(text)) {
    const v = m[0].toLowerCase();
    const type: ObservableType = v.length === 32 ? 'md5' : v.length === 40 ? 'sha1' : 'sha256';
    hits.push({ type, start: m.index, end: m.index + v.length, value: v });
  }
  return hits;
}

const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

function scanCves(text: string): Candidate[] {
  const hits: Candidate[] = [];
  CVE_RE.lastIndex = 0;
  for (let m = CVE_RE.exec(text); m; m = CVE_RE.exec(text)) {
    hits.push({ type: 'cve', start: m.index, end: m.index + m[0].length, value: m[0].toUpperCase() });
  }
  return hits;
}

// Named-event objects have no spaces in the name — including them would
// swallow trailing prose ("Global\Foo for locking"), so they are excluded.
const MUTEX_RE = /\b(?:Global|Local)\\[A-Za-z0-9._{}()-]{3,80}/g;

function scanMutexes(text: string): Candidate[] {
  const hits: Candidate[] = [];
  MUTEX_RE.lastIndex = 0;
  for (let m = MUTEX_RE.exec(text); m; m = MUTEX_RE.exec(text)) {
    const v = m[0].replace(/[.)]+$/, '');
    if (v.length <= m[0].indexOf('\\') + 1) continue;
    hits.push({ type: 'mutex', start: m.index, end: m.index + m[0].length, value: v });
  }
  return hits;
}

const REGISTRY_RE =
  /\b(?:HKEY_(?:LOCAL_MACHINE|CURRENT_USER|CLASSES_ROOT|CURRENT_CONFIG|USERS)|HK(?:LM|CU|CR|U|CC))[\\/][^\s"'<>]{2,}/gi;

function scanRegistryKeys(text: string): Candidate[] {
  const hits: Candidate[] = [];
  REGISTRY_RE.lastIndex = 0;
  for (let m = REGISTRY_RE.exec(text); m; m = REGISTRY_RE.exec(text)) {
    const v = stripTrailingSlashes(stripTrailing(m[0]));
    if (v.length < 5) continue;
    hits.push({ type: 'registry_key', start: m.index, end: m.index + m[0].length, value: v });
  }
  return hits;
}

const WIN_PATH_RE = /\b[A-Za-z]:\\[^\s"'<>|]{2,}/g;

function scanWindowsPaths(text: string): Candidate[] {
  const hits: Candidate[] = [];
  WIN_PATH_RE.lastIndex = 0;
  for (let m = WIN_PATH_RE.exec(text); m; m = WIN_PATH_RE.exec(text)) {
    let v = stripTrailing(m[0]);
    while (v.endsWith('\\')) v = v.slice(0, -1);
    if (v.length < 5) continue;
    hits.push({ type: 'file_path_windows', start: m.index, end: m.index + m[0].length, value: v });
  }
  return hits;
}

const UNIX_PATH_PREFIX = String.raw`(usr|etc|opt|tmp|var|home|root|bin|sbin|Library|Applications)`;
const UNIX_PATH_RE = new RegExp(String.raw`\/${UNIX_PATH_PREFIX}(?:\/[^\s"'<>|,]+)+`, 'g');

function scanUnixPaths(text: string): Candidate[] {
  const hits: Candidate[] = [];
  UNIX_PATH_RE.lastIndex = 0;
  for (let m = UNIX_PATH_RE.exec(text); m; m = UNIX_PATH_RE.exec(text)) {
    // Require a non-word boundary before the leading slash.
    const prevOk = m.index === 0 || !/\w/.test(text.charAt(m.index - 1));
    if (!prevOk) continue;
    const v = stripTrailing(m[0]);
    if (v.length < 6) continue;
    hits.push({ type: 'file_path_unix', start: m.index, end: m.index + m[0].length, value: v });
  }
  return hits;
}

const BTC_RE = /\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g;
const ETH_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const XMR_RE = /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g;

function scanSimple(re: RegExp, type: ObservableType, minLen: number): (text: string) => Candidate[] {
  return (text: string): Candidate[] => {
    const hits: Candidate[] = [];
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0].length < minLen) continue;
      hits.push({ type, start: m.index, end: m.index + m[0].length, value: m[0] });
    }
    return hits;
  };
}

const scanBtc = scanSimple(BTC_RE, 'btc_address', 26);
const scanEth = scanSimple(ETH_RE, 'eth_address', 42);
const scanXmr = scanSimple(XMR_RE, 'xmr_address', 95);

/**
 * Extract deterministic observables from arbitrary text. Runs on a refanged
 * copy; contexts are cut from the original input so defanged markers stay
 * visible to analysts. See module header for pipeline details.
 */
export function extractObservables(text: string, opts?: ExtractObservablesOptions): ExtractObservablesResult {
  const maxHits = opts?.maxHits ?? 2000;
  const contextChars = opts?.contextChars ?? 40;
  const dedupeUrlHosts = opts?.dedupeUrlHosts !== false;

  const ref = refangInternal(text);
  const clean = ref.text;

  // Priority order matters: higher-priority types claim their spans first,
  // lower-priority overlapping candidates are dropped (URL hosts, email
  // domains, hash-vs-btc collisions, etc.).
  const buckets: Candidate[][] = [
    scanUrls(clean),
    scanEmails(clean),
    scanRegistryKeys(clean),
    scanMutexes(clean),
    scanWindowsPaths(clean),
    scanUnixPaths(clean),
    scanIpv6(clean),
    scanIpv4(clean),
    scanHashes(clean),
    scanCves(clean),
    scanBtc(clean),
    scanEth(clean),
    scanXmr(clean),
  ];

  const accepted: Candidate[] = [];
  const overlaps = (cand: Candidate): boolean => accepted.some((a) => cand.start < a.end && a.start < cand.end);

  for (const bucket of buckets) {
    for (const cand of bucket) {
      if (!overlaps(cand)) accepted.push(cand);
    }
  }
  // Domains run last: an accepted URL/email claims its host span, so bare
  // domains don't double-emit. With dedupeUrlHosts === false the host of an
  // accepted URL is allowed through as its own domain hit.
  for (const cand of scanDomains(clean)) {
    if (!overlaps(cand)) {
      accepted.push(cand);
      continue;
    }
    if (dedupeUrlHosts) continue;
    const hostOfUrl = accepted.some(
      (a) => a.type === 'url' && cand.start >= a.start && cand.end <= a.end && a.value.includes(cand.value)
    );
    if (hostOfUrl) accepted.push(cand);
  }

  // Dedupe identical (type, value), keeping the FIRST occurrence. Domains,
  // emails, and hashes additionally dedupe case-insensitively; crypto
  // addresses are case-sensitive so their keys stay exact.
  const caseInsensitive = new Set<ObservableType>(['domain', 'email', 'md5', 'sha1', 'sha256', 'cve']);
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const cand of accepted.sort((a, b) => a.start - b.start)) {
    const key = `${cand.type}:${caseInsensitive.has(cand.type) ? cand.value.toLowerCase() : cand.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cand);
  }

  const truncated = unique.length > maxHits;
  const finalList = truncated ? unique.slice(0, maxHits) : unique;

  const counts: Record<string, number> = {};
  for (const t of OBSERVABLE_TYPES) counts[t] = 0;
  for (const cand of finalList) counts[cand.type] = (counts[cand.type] ?? 0) + 1;

  const observables: ObservableHit[] = finalList.map((cand) => {
    const hit: ObservableHit = { type: cand.type, value: cand.value, index: cand.start };
    if (contextChars > 0) {
      const from = Math.max(0, cand.start - contextChars);
      const to = Math.min(clean.length, cand.end + contextChars);
      const oStart = ref.map[from] ?? cand.start;
      const oEnd = (ref.map[to - 1] ?? cand.end) + 1;
      hit.context = text.slice(oStart, oEnd).replace(/\s+/g, ' ').trim();
    }
    return hit;
  });

  return truncated
    ? { counts, observables, refangedCount: ref.count, truncated: true }
    : { counts, observables, refangedCount: ref.count };
}
