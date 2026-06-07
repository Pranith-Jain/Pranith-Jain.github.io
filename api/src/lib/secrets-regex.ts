/**
 * Secrets-in-text regex bank.
 *
 * Ported from SCOPTIX (https://github.com/Omnitarium/scoptix) — original
 * file: `lib/regex-analysis.ts`, Apache-2.0. The rule set, prefilter
 * optimisation, and overlap-protection algorithm are unchanged. We
 * added a `redactSnippet()` helper so UI surfacing can display
 * "AKIA****" rather than leaking the live credential.
 *
 * Why a dedicated module:
 *   - Our existing `api/src/lib/extract.ts` extracts IoCs (URLs, IPs,
 *     hashes, CVEs, actors). It does NOT detect leaked credentials in
 *     arbitrary text. The SCOPTIX bank fills that gap.
 *   - Each finding has a stable `type` (e.g. 'aws-key', 'jwt-token')
 *     and a `snippet` clipped to 240 chars, with overlaps protected so
 *     generic rules don't double-fire on top of specific ones.
 *
 * Pure. No I/O. No LLM. Synchronous — safe to run per-indicator inside
 * the existing enrichment pipeline without a network call.
 */

export type FindingSource = 'url_string' | 'response_body';

export interface SecretFinding {
  /** Stable rule id (e.g. 'aws-key', 'jwt-token', 'slack-webhook'). */
  type: string;
  /** Original matched text, clipped to 240 chars. */
  snippet: string;
  /** Redacted version safe to render in UI / logs. */
  redacted: string;
  /** Where this finding came from. */
  source: FindingSource;
}

interface Rule {
  type: string;
  /** Lower = higher priority. Generic rules (priority 90+) only fire
   *  on spans NOT already claimed by a higher-priority rule. */
  priority: number;
  re: RegExp;
  /** If set, the input MUST contain at least one of these substrings
   *  (case-insensitive if the regex has the `i` flag) before the
   *  regex itself runs. Cheap O(N) prefilter. */
  prefilters?: string[];
}

// RULES sorted alphabetically by 'type' for stable maintenance.
const RULES: Rule[] = [
  {
    type: 'aws-key',
    priority: 10,
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    prefilters: ['AKIA', 'ASIA', 'ABIA', 'ACCA'],
  },
  {
    type: 'azure-sas-token',
    priority: 20,
    re: /(?:sig|signature)=([a-zA-Z0-9%+/]{40,})/gi,
    prefilters: ['sig=', 'signature='],
  },
  {
    type: 'basic-auth-url',
    priority: 20,
    re: /https?:\/\/[^\s:@/]+:([^\s:@/]{3,})@[^\s/?#]+/gi,
    prefilters: ['http://', 'https://', '@'],
  },
  {
    type: 'bearer-token',
    priority: 50,
    re: /[Bb]earer\s+([A-Za-z0-9_\-.~+/]{20,})\b/g,
    prefilters: ['bearer '],
  },
  {
    type: 'combo-list-cred',
    priority: 15,
    // Stealer log `URL:Username:Password` / `URL:Email:Password` shape.
    re: /(?:https?:\/\/[a-zA-Z0-9.-]+(?::\d{2,5})?(?:[/?#][^:\s]*)?):([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9_-]{3,30}):([^:\s]{4,50})/gi,
    prefilters: ['http'],
  },
  {
    type: 'credential-like',
    priority: 100,
    re: /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*([^\s&"']{8,80})/gi,
  },
  {
    type: 'credit-card',
    priority: 60,
    re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
  },
  {
    type: 'db-connection',
    priority: 20,
    re: /(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s'"]{10,}/gi,
    prefilters: ['mysql://', 'postgres://', 'postgresql://', 'mongodb://', 'mongodb+srv://', 'redis://', 'mssql://'],
  },
  {
    type: 'email',
    priority: 90,
    re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    prefilters: ['@'],
  },
  {
    type: 'gcp-service-account',
    priority: 10,
    re: /"type"\s*:\s*"service_account"\s*,\s*"project_id"/g,
    prefilters: ['service_account'],
  },
  {
    type: 'github-token',
    priority: 10,
    re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,255}\b/g,
    prefilters: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'],
  },
  {
    type: 'gitlab-token',
    priority: 10,
    re: /\bglpat-[a-zA-Z0-9-]{20}\b/g,
    prefilters: ['glpat-'],
  },
  {
    type: 'google-api-key',
    priority: 10,
    re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g,
    prefilters: ['AIzaSy'],
  },
  {
    type: 'hex-secret',
    priority: 90,
    re: /(?:key|secret|token|apikey|api_key|access_key|auth)\s*[=:]\s*[0-9a-f]{32,}/gi,
  },
  {
    type: 'jwt-token',
    priority: 30,
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    prefilters: ['eyJ'],
  },
  {
    type: 'openai-key',
    priority: 10,
    re: /\bsk-[a-zA-Z0-9]{48}\b/g,
    prefilters: ['sk-'],
  },
  {
    type: 'private-key',
    priority: 10,
    re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
    prefilters: ['-----BEGIN '],
  },
  {
    type: 'sendgrid-key',
    priority: 10,
    re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    prefilters: ['SG.'],
  },
  {
    type: 'slack-bot-token',
    priority: 10,
    re: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    prefilters: ['xoxb-'],
  },
  {
    type: 'slack-user-token',
    priority: 10,
    re: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    prefilters: ['xoxp-'],
  },
  {
    type: 'slack-webhook',
    priority: 10,
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/g,
    prefilters: ['hooks.slack.com/services/'],
  },
  {
    type: 'stripe-key',
    priority: 10,
    re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,99}\b/g,
    prefilters: ['_live_', '_test_'],
  },
  {
    type: 'twilio-key',
    priority: 10,
    re: /\bSK[a-z0-9]{32}\b/g,
    prefilters: ['SK'],
  },
];

// Pre-sort by priority so the most specific rules run first.
const EXECUTION_ORDER = [...RULES].sort((a, b) => a.priority - b.priority);

/** Maximum snippet length surfaced to the UI. */
const SNIPPET_MAX = 240;

export interface ScanOptions {
  /** Source label attached to each finding. */
  source?: FindingSource;
  /** When true, redact snippets in the returned `redacted` field
   *  (always true; kept as an option for symmetry with the
   *  `source` field and future per-rule policies). */
  redact?: boolean;
  /** Optional per-type allowlist — restrict scanning to these rule
   *  ids. Empty / undefined means scan with every rule. */
  only?: ReadonlySet<string>;
}

export function runSecretScan(text: string, opts: ScanOptions = {}): SecretFinding[] {
  const source: FindingSource = opts.source ?? 'url_string';
  const redact = opts.redact ?? true;
  const only = opts.only;
  const textLower = text.toLowerCase();
  const findings: SecretFinding[] = [];
  // Tracks claimed character ranges so a generic rule (priority 90+)
  // doesn't double-report a span already covered by a specific one
  // (priority 10–30). Same protection as the SCOPTIX original.
  const claimed: { start: number; end: number }[] = [];

  for (const r of EXECUTION_ORDER) {
    if (only && !only.has(r.type)) continue;

    if (r.prefilters && r.prefilters.length > 0) {
      const isCaseInsensitive = r.re.flags.includes('i');
      const targetText = isCaseInsensitive ? textLower : text;
      let hit = false;
      for (const pf of r.prefilters) {
        const needle = isCaseInsensitive ? pf.toLowerCase() : pf;
        if (targetText.includes(needle)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
    }

    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      const overlaps = claimed.some((c) => start < c.end && end > c.start);
      if (overlaps) continue;

      claimed.push({ start, end });
      // Use capture group 1 if present (e.g. credential-like where the
      // value after `=` is more useful than the full `key=…` form),
      // otherwise the full match.
      const raw = m[1] !== undefined ? m[1] : m[0];
      const clipped = raw.length > SNIPPET_MAX ? `${raw.slice(0, SNIPPET_MAX)}…` : raw;
      findings.push({
        type: r.type,
        snippet: clipped,
        redacted: redact ? redactSecret(clipped) : clipped,
        source,
      });
    }
  }

  return findings;
}

/**
 * Mask the middle of a secret with `*`. Keeps the prefix and suffix so
 * an analyst can still identify which credential matched (e.g.
 * `AKIA****MPLE`) but the live value is not surfaced to the UI,
 * logs, or third-party telemetry.
 *
 * Rules:
 *   - length ≤ 4: return as-is (too short to safely mask).
 *   - length 5–8: keep first 2 + stars + last 1.
 *   - length > 8: keep first 4 + stars + last 4.
 *
 * Bearer prefixes (`Bearer `, `Basic `), `key=`, `?token=` style
 * decorations are left intact — the mask only targets the secret
 * value itself.
 */
export function redactSecret(secret: string): string {
  if (secret.length <= 4) return secret;
  if (secret.length <= 8) {
    return `${secret.slice(0, 2)}${'*'.repeat(Math.max(1, secret.length - 3))}${secret.slice(-1)}`;
  }
  return `${secret.slice(0, 4)}${'*'.repeat(Math.max(4, secret.length - 8))}${secret.slice(-4)}`;
}

/** Type id of every rule, for callers that want to enumerate. */
export const SECRET_RULE_TYPES = RULES.map((r) => r.type).sort();
