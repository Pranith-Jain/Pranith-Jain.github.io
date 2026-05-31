/**
 * Artifact classification — pure functions that turn an exposed file/dir name
 * (and optional leak-type hint) into risk tag badges and a coarse artifact
 * type, mirroring the etugen.io "EXPOSED HOST" experience.
 *
 * Kept dependency-free and side-effect-free so it can be unit-tested in
 * isolation and reused by both the host-intel aggregator and the artifact
 * detail view.
 */

/** Risk tag badges shown next to an artifact. */
export type ArtifactTag =
  | 'git-exposure'
  | 'history'
  | 'scanner'
  | 'tunnel'
  | 'exploit'
  | 'c2'
  | 'mitm'
  | 'active-directory'
  | 'credentials'
  | 'database'
  | 'config'
  | 'source-code'
  | 'archive';

/** Coarse artifact type for the table's TYPE column. */
export type ArtifactType =
  | 'DIR'
  | 'MD'
  | 'LOG'
  | 'JSON'
  | 'YAML'
  | 'PY'
  | 'JS'
  | 'EXE'
  | 'DLL'
  | 'ZIP'
  | 'SQL'
  | 'TXT'
  | 'ENV'
  | 'KEY'
  | 'BIN'
  | 'FILE';

const EXT_TYPE: Record<string, ArtifactType> = {
  md: 'MD',
  markdown: 'MD',
  log: 'LOG',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  py: 'PY',
  js: 'JS',
  mjs: 'JS',
  ts: 'JS',
  exe: 'EXE',
  dll: 'DLL',
  zip: 'ZIP',
  tar: 'ZIP',
  gz: 'ZIP',
  '7z': 'ZIP',
  rar: 'ZIP',
  sql: 'SQL',
  db: 'SQL',
  sqlite: 'SQL',
  txt: 'TXT',
  env: 'ENV',
  pem: 'KEY',
  key: 'KEY',
  ppk: 'KEY',
  bin: 'BIN',
  exe_: 'EXE',
};

/** Returns the coarse artifact type for a name. Directories end in `/`. */
export function artifactType(name: string): ArtifactType {
  const trimmed = name.trim();
  if (!trimmed) return 'FILE';
  if (trimmed.endsWith('/')) return 'DIR';
  const dot = trimmed.lastIndexOf('.');
  if (dot === -1 || dot === trimmed.length - 1) return 'FILE';
  const ext = trimmed.slice(dot + 1).toLowerCase();
  return EXT_TYPE[ext] ?? 'FILE';
}

/**
 * Filename-substring → tag rules. First-match-wins is NOT used; every matching
 * rule contributes its tag (an artifact can be both `c2` and `exploit`).
 * Patterns are matched case-insensitively against the lowercased basename.
 */
const NAME_RULES: Array<{ test: RegExp; tag: ArtifactTag }> = [
  { test: /(^|\/)\.git(\/|$)|\.git\/|gitconfig|\.git-credentials/, tag: 'git-exposure' },
  { test: /\.(bash_history|zsh_history|lesshst|viminfo|wget-hsts|python_history|mysql_history)$/, tag: 'history' },
  { test: /bash_history|zsh_history|history/, tag: 'history' },
  { test: /\.(burpsuite|nuclei|nmap|masscan|amass|subfinder|httpx)\b|\bburp|\bnuclei\b|recon|scan(ner)?/, tag: 'scanner' },
  { test: /\bngrok\b|cloudflared|tunnel|\bfrp[cs]?\b/, tag: 'tunnel' },
  { test: /exploit|privesc|0day|poc[-_.]|cve-\d{4}/, tag: 'exploit' },
  { test: /meterpreter|empire|cobalt|beacon|\bc2\b|covenant|sliver|mythic|havoc/, tag: 'c2' },
  { test: /inveigh|responder|mitm|bettercap|ettercap|arpspoof/, tag: 'mitm' },
  { test: /sharphound|bloodhound|mimikatz|kerberoast|ntds|secretsdump|\bldap\b|\bad[-_]/, tag: 'active-directory' },
  { test: /password|passwd|creds?|credential|\.htpasswd|shadow$|secret|token|api[-_]?key/, tag: 'credentials' },
  { test: /\.(sql|db|sqlite3?|mdb|bak)$|dump\.sql|backup/, tag: 'database' },
  { test: /\.env$|config\.(json|ya?ml|php|ini)$|\.dockercfg|wp-config|settings\.py/, tag: 'config' },
  { test: /\.(py|js|ts|go|rb|php|java|c|cpp|sh)$/, tag: 'source-code' },
  { test: /\.(zip|tar|gz|7z|rar|tgz)$/, tag: 'archive' },
];

/**
 * Maps a leak-type hint (e.g. from LeakIX `leak_type`) to a tag, when present.
 */
const LEAK_TYPE_RULES: Array<{ test: RegExp; tag: ArtifactTag }> = [
  { test: /git/, tag: 'git-exposure' },
  { test: /database|mongo|elastic|redis|mysql|postgres/, tag: 'database' },
  { test: /credential|secret|password|token/, tag: 'credentials' },
  { test: /config|\.env/, tag: 'config' },
];

const TAG_ORDER: ArtifactTag[] = [
  'git-exposure',
  'credentials',
  'c2',
  'exploit',
  'active-directory',
  'mitm',
  'database',
  'config',
  'tunnel',
  'scanner',
  'history',
  'source-code',
  'archive',
];

/** Lowercased basename of a path (handles trailing slash on dirs). */
function basename(name: string): string {
  const stripped = name.replace(/\/+$/, '');
  const slash = stripped.lastIndexOf('/');
  return (slash === -1 ? stripped : stripped.slice(slash + 1)).toLowerCase();
}

/**
 * Classify an artifact into ordered, de-duplicated risk tags.
 *
 * @param name      File or directory name (directories may end in `/`).
 * @param leakType  Optional leak-type hint from an upstream source.
 */
export function classifyArtifact(name: string, leakType?: string): ArtifactTag[] {
  const base = basename(name);
  const full = name.toLowerCase();
  const found = new Set<ArtifactTag>();

  for (const rule of NAME_RULES) {
    if (rule.test.test(base) || rule.test.test(full)) found.add(rule.tag);
  }
  if (leakType) {
    const lt = leakType.toLowerCase();
    for (const rule of LEAK_TYPE_RULES) {
      if (rule.test.test(lt)) found.add(rule.tag);
    }
  }

  return TAG_ORDER.filter((t) => found.has(t));
}

/** True for the high-signal tags worth surfacing as a host-level risk flag. */
const HIGH_RISK: ReadonlySet<ArtifactTag> = new Set<ArtifactTag>([
  'git-exposure',
  'credentials',
  'c2',
  'exploit',
  'active-directory',
  'mitm',
  'database',
]);

/** Returns the subset of tags considered high-risk, preserving order. */
export function highRiskTags(tags: ArtifactTag[]): ArtifactTag[] {
  return tags.filter((t) => HIGH_RISK.has(t));
}
