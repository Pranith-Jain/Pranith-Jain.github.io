/* eslint-disable no-useless-escape */
/**
 * PARSE-X — Raw text → clean artifacts.
 *
 * Edge-native artifact extractor replicated from
 * https://h3ad-sec.github.io/PARSE-X/ — 18 artifact types covering
 * network indicators, host artifacts, vulnerability references,
 * MITRE ATT&CK technique IDs, and email/path artifacts. Pure
 * pattern engine, no external API calls, so it runs in <10ms for
 * typical incident reports and 100% client-side.
 *
 * Exposed as:
 *   - MCP tool `si_parse_text`  (Worker)
 *   - REST  `POST /api/v1/si/parse`  (api)
 *
 * Returns:
 *   {
 *     defangedInput,            // refanged text (hxxp→http, [.]→., etc)
 *     homographsFolded,         // true if Cyrillic/Greek lookalikes were folded
 *     counts: { ipv4, domain, ... 18 keys ... },
 *     artifacts: { ipv4: [{value, offset, line, col, source}], ... },
 *     iocs: {
 *       network: [...],          // ipv4/ipv6/domain/url/mac/email/asn
 *       host: [...],             // hashes/registry/process/dll/path/port
 *       threat: [...],           // cve/mitre
 *     }
 *   }
 *
 * 18 artifact types match the upstream PARSE-X product:
 *   1.  IPv4   2. IPv6  3. Domain  4. URL  5. Email
 *   6.  MD5    7. SHA1  8. SHA256  9. SHA512
 *  10.  CVE   11. MITRE ATT&CK
 *  12.  Registry  13. Process  14. DLL  15. File path
 *  16.  Port   17. MAC   18. ASN
 */

// ---------------------------------------------------------------------------
// Defang / refang — handles the common defang conventions used by
// defenders (to make IOCs safe to paste) and by attackers (to bypass
// naive scanners). Applied iteratively until the string stabilises.
// ---------------------------------------------------------------------------

const REFANG_PATTERNS: Array<[RegExp, string | ((match: string) => string)]> = [
  // Protocol
  [/\bhxxps?/gi, (m) => m.toLowerCase().replace('hxxp', 'http')],
  [/\bhxtps?/gi, (m) => m.toLowerCase().replace('hxtp', 'http')],
  [/\b\[protocol\]/gi, 'https'],
  // Bracket defangs (specific)
  [/\[\.\]/g, '.'],
  [/\(\.\)/g, '.'],
  [/\{\.\}/g, '.'],
  [/\[\:\]/g, ':'],
  [/\[\/\]/g, '/'],
  [/\[\@\]/g, '@'],
  // Generic: strip square brackets around non-alphanumeric content
  // (so [://], [port], [path] etc. unwrap, but [dot] [com] [at] etc. are
  // left for the specific spelled-out rules below).
  [/\[([^\[\]\na-zA-Z]{1,6})\]/g, '$1'],
  // Defanged TLDs: [com], [tk], [io], [ru], [cn], [ml], [ga], [cf], [xyz]
  [/\[\.(com|tk|io|ru|cn|ml|ga|cf|xyz|net|org|info|biz|us|uk|co|me|app|dev)\b\]/gi, '.$1'],
  [/\[(com|tk|io|ru|cn|ml|ga|cf|xyz|net|org|info|biz|us|uk|co|me|app|dev)\b\]/gi, '.$1'],
  // Spelled-out
  [/\b\[dot\]/gi, '.'],
  [/\(dot\)/gi, '.'],
  [/\{dot\}/gi, '.'],
  [/\bdot\b/gi, '.'],
  [/\b\[punto\]/gi, '.'],
  [/\b\[punt\]/gi, '.'],
  // Unicode
  [/[\uFF0E\u3002\u00B7]/g, '.'],
  [/[\uFF1A]/g, ':'],
  // Padding obfuscation
  [/\s*\[dot\]\s*/gi, '.'],
  [/\s+\.\s+/g, '.'],
];

const HOMOGRAPHS: Record<string, string> = {
  '\u0430': 'a',
  '\u0410': 'A',
  '\u0435': 'e',
  '\u0415': 'E',
  '\u043E': 'o',
  '\u041E': 'O',
  '\u0440': 'p',
  '\u0420': 'P',
  '\u0441': 'c',
  '\u0421': 'C',
  '\u0445': 'x',
  '\u0425': 'X',
  '\u0455': 's',
  '\u0405': 'S',
  '\u0456': 'i',
  '\u0406': 'I',
  '\u03BF': 'o',
  '\u039F': 'O',
  '\u03B1': 'a',
  '\u0391': 'A',
  '\u03C1': 'p',
  '\u03A1': 'P',
  '\u03C5': 'u',
  '\uFF0E': '.',
  '\u3002': '.',
  '\u00B7': '.',
};

export function foldHomographs(s: string): { folded: string; changed: boolean } {
  let out = '';
  let changed = false;
  for (const ch of s) {
    const repl = HOMOGRAPHS[ch];
    if (repl !== undefined && repl !== ch) {
      out += repl;
      changed = true;
    } else {
      out += ch;
    }
  }
  return { folded: out, changed };
}

export function refang(s: string): string {
  let prev: string;
  let cur = s;
  for (let i = 0; i < 8; i++) {
    prev = cur;
    for (const [pat, rep] of REFANG_PATTERNS) {
      cur = typeof rep === 'string' ? cur.replace(pat, rep) : cur.replace(pat, rep);
    }
    if (cur === prev) break;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Pattern catalogue — 18 types.
// ---------------------------------------------------------------------------

export type ArtifactKind =
  | 'ipv4'
  | 'ipv6'
  | 'domain'
  | 'url'
  | 'email'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'sha512'
  | 'cve'
  | 'mitre'
  | 'registry'
  | 'process'
  | 'dll'
  | 'filePath'
  | 'port'
  | 'mac'
  | 'asn';

const PATTERNS: Record<ArtifactKind, RegExp> = {
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi,
  url: /\b(?:https?|ftp):\/\/[^\s<>"')\[\]]+/gi,
  email: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  md5: /\b[a-f0-9]{32}\b/gi,
  sha1: /\b[a-f0-9]{40}\b/gi,
  sha256: /\b[a-f0-9]{64}\b/gi,
  sha512: /\b[a-f0-9]{128}\b/gi,
  cve: /\bCVE-(?:19|20)\d{2}-\d{4,7}\b/gi,
  mitre: /\bT1(?:0[0-9]{2}|[1-9]\d{2})(?:\.\d{3})?\b/g,
  registry:
    /\bH(?:K(LM|E_(?:LM|U(?:SERS|CLASSES(?:_LOCAL_MACHINE|_CURRENT_USER))?)|CR))\\(?:[A-Za-z0-9_ \-\.]+\\)*[A-Za-z0-9_ \-\.]+/g,
  process: /\b[a-z0-9_\- ]+\.(?:exe|bat|cmd|ps1|vbs|js|hta|wsf|lnk|jar|scr|com)\b/gi,
  dll: /\b[a-z0-9_\- ]+\.dll\b/gi,
  filePath: /(?:[A-Za-z]:(?:\\[^\\/:*?"<>|\s]+\\?)+|\/(?:[a-z0-9_\-\.]+\/)+[a-z0-9_\-\.]+(?:\.[a-z0-9]+)?)/g,
  port: /\b(?:port|Port|PORT)\s*[=:]\s*([0-9]{1,5})\b/g,
  mac: /\b(?:[0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}\b/g,
  asn: /\bAS(?:N)?\s?-?\s?(\d{1,10})\b/gi,
};

interface RawHit {
  value: string;
  offset: number;
  line: number;
  col: number;
}

function runWithMeta(input: string, pattern: RegExp, captureGroup = 0): RawHit[] {
  const hits: RawHit[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(input))) {
    const value = m[captureGroup] ?? m[0];
    if (!value) continue;
    const upTo = input.slice(0, m.index);
    const line = (upTo.match(/\n/g) ?? []).length + 1;
    const lastNl = upTo.lastIndexOf('\n');
    const col = m.index - (lastNl + 1) + 1;
    hits.push({ value, offset: m.index, line, col });
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }
  return hits;
}

export interface ParseResult {
  defangedInput: string;
  homographsFolded: boolean;
  counts: Record<ArtifactKind, number>;
  artifacts: Record<
    ArtifactKind,
    Array<{ value: string; offset: number; line: number; col: number; source: 'refanged' | 'verbatim' }>
  >;
  iocs: {
    network: Array<{ kind: ArtifactKind; value: string; line: number }>;
    host: Array<{ kind: ArtifactKind; value: string; line: number }>;
    threat: Array<{ kind: ArtifactKind; value: string; line: number }>;
  };
}

const NETWORK: ArtifactKind[] = ['ipv4', 'ipv6', 'domain', 'url', 'email', 'mac', 'asn'];
const HOST: ArtifactKind[] = ['md5', 'sha1', 'sha256', 'sha512', 'registry', 'process', 'dll', 'filePath', 'port'];
const THREAT: ArtifactKind[] = ['cve', 'mitre'];

const ALL_KINDS: ArtifactKind[] = [...NETWORK, ...HOST, ...THREAT];

export function parseArtifacts(
  input: string,
  opts: { foldHomographs?: boolean; refangInput?: boolean } = {}
): ParseResult {
  const { foldHomographs: doFold = true, refangInput: doRefang = true } = opts;
  const refanged = doRefang ? refang(input) : input;
  const { folded, changed: homographsFolded } = doFold
    ? foldHomographs(refanged)
    : { folded: refanged, changed: false };

  const artifacts = emptyArtifacts();
  const counts = emptyCounts();

  for (const kind of ALL_KINDS) {
    const pattern = PATTERNS[kind];
    const captureGroup = kind === 'port' || kind === 'asn' ? 1 : 0;
    const hits = runWithMeta(folded, pattern, captureGroup);
    const seen = new Set<string>();
    const dedup: ParseResult['artifacts'][ArtifactKind] = [];
    for (const h of hits) {
      const key = h.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push({
        value: h.value,
        offset: h.offset,
        line: h.line,
        col: h.col,
        source: doRefang || doFold ? 'refanged' : 'verbatim',
      });
    }
    artifacts[kind] = dedup;
    counts[kind] = dedup.length;
  }

  // Remove sub-hash false positives: a sha1 hex string that is a prefix of
  // a sha256 in the same input.
  for (const long of ['sha256', 'sha1', 'md5'] as ArtifactKind[]) {
    const longer = long === 'md5' ? null : long === 'sha1' ? 'sha256' : long === 'sha256' ? 'sha512' : null;
    if (!longer) continue;
    artifacts[long] = artifacts[long].filter((a) => {
      for (const longer2 of artifacts[longer]) {
        if (longer2.value.toLowerCase().startsWith(a.value.toLowerCase())) return false;
      }
      return true;
    });
    counts[long] = artifacts[long].length;
  }

  const iocs: ParseResult['iocs'] = { network: [], host: [], threat: [] };
  const push = (kind: ArtifactKind, group: keyof ParseResult['iocs']) => {
    for (const a of artifacts[kind]) {
      iocs[group].push({ kind, value: a.value, line: a.line });
    }
  };
  for (const k of NETWORK) push(k, 'network');
  for (const k of HOST) push(k, 'host');
  for (const k of THREAT) push(k, 'threat');

  return { defangedInput: folded, homographsFolded, counts, artifacts, iocs };
}

export interface SiParseOptions {
  refang?: boolean;
  foldHomographs?: boolean;
  maxChars?: number;
  kinds?: ArtifactKind[];
}

export function siParseText(input: string, opts: SiParseOptions = {}): ParseResult {
  const maxChars = opts.maxChars ?? 1_000_000;
  if (!input) {
    return {
      defangedInput: '',
      homographsFolded: false,
      counts: emptyCounts(),
      artifacts: emptyArtifacts(),
      iocs: { network: [], host: [], threat: [] },
    };
  }
  if (input.length > maxChars) {
    throw new Error(
      `Input exceeds maxChars=${maxChars} (got ${input.length}). Pass a smaller chunk or raise the limit.`
    );
  }
  const result = parseArtifacts(input, { refangInput: opts.refang, foldHomographs: opts.foldHomographs });
  if (opts.kinds && opts.kinds.length > 0) {
    const allowed = new Set(opts.kinds);
    for (const k of ALL_KINDS) {
      if (!allowed.has(k)) {
        result.artifacts[k] = [];
        result.counts[k] = 0;
      }
    }
    result.iocs = { network: [], host: [], threat: [] };
    for (const k of NETWORK)
      if (allowed.has(k))
        for (const a of result.artifacts[k]) result.iocs.network.push({ kind: k, value: a.value, line: a.line });
    for (const k of HOST)
      if (allowed.has(k))
        for (const a of result.artifacts[k]) result.iocs.host.push({ kind: k, value: a.value, line: a.line });
    for (const k of THREAT)
      if (allowed.has(k))
        for (const a of result.artifacts[k]) result.iocs.threat.push({ kind: k, value: a.value, line: a.line });
  }
  return result;
}

function emptyCounts(): Record<ArtifactKind, number> {
  const c = {} as Record<ArtifactKind, number>;
  for (const k of ALL_KINDS) c[k] = 0;
  return c;
}

function emptyArtifacts(): Record<
  ArtifactKind,
  Array<{ value: string; offset: number; line: number; col: number; source: 'refanged' | 'verbatim' }>
> {
  const a = {} as Record<
    ArtifactKind,
    Array<{ value: string; offset: number; line: number; col: number; source: 'refanged' | 'verbatim' }>
  >;
  for (const k of ALL_KINDS) a[k] = [];
  return a;
}
