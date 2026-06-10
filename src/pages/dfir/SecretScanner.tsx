import { useMemo, useState } from 'react';
import type { Severity as Sev } from '../../components/severity';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, AlertTriangle, ShieldAlert, ShieldX, ShieldCheck, Info } from 'lucide-react';

/**
 * Secret / API-Key Scanner — 100% client-side.
 *
 * Paste code, config, .env, CI logs, JSON. Known credential formats
 * (cloud keys, VCS/CI/SaaS tokens, private keys, DB URIs, JWTs) are
 * matched by signature; generic `key = "…"` assignments are flagged when
 * the value is high-entropy. Matches are shown redacted with a line
 * number. Nothing leaves the browser — paste freely.
 */

interface Hit {
  sev: Sev;
  kind: string;
  redacted: string;
  line: number;
}

const SEV_ORDER: Record<Sev, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const SEV_STYLE: Record<Sev, { text: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldX,
  },
  high: {
    text: 'text-rose-600 dark:text-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400',
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  low: {
    text: 'text-sky-700 dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    Icon: Info,
  },
  info: {
    text: 'text-slate-600 dark:text-slate-400',
    chip: 'border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-400',
    Icon: Info,
  },
};

interface Rule {
  kind: string;
  sev: Sev;
  re: RegExp;
}

const RULES: Rule[] = [
  { kind: 'AWS Access Key ID', sev: 'critical', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  {
    kind: 'AWS Secret Access Key (contextual)',
    sev: 'critical',
    re: /aws.{0,20}?(?:secret|sk).{0,3}['"=:\s]+([A-Za-z0-9/+]{40})\b/gi,
  },
  { kind: 'GCP service-account private key', sev: 'critical', re: /"type"\s*:\s*"service_account"/g },
  { kind: 'Google API key', sev: 'high', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    kind: 'GitHub token',
    sev: 'critical',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  },
  { kind: 'GitLab PAT', sev: 'critical', re: /\bglpat-[A-Za-z0-9_-]{20}\b/g },
  { kind: 'Slack token', sev: 'high', re: /\bxox[baprs]-[0-9A-Za-z-]{10,48}\b/g },
  { kind: 'Slack webhook', sev: 'medium', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g },
  { kind: 'Stripe secret key', sev: 'critical', re: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}\b/g },
  { kind: 'SendGrid API key', sev: 'critical', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { kind: 'Twilio API key SID', sev: 'high', re: /\bSK[0-9a-fA-F]{32}\b/g },
  { kind: 'Twilio Account SID', sev: 'medium', re: /\bAC[0-9a-fA-F]{32}\b/g },
  { kind: 'Mailgun key', sev: 'high', re: /\bkey-[0-9a-zA-Z]{32}\b/g },
  { kind: 'NPM token', sev: 'high', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: 'PyPI token', sev: 'high', re: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/g },
  { kind: 'Datadog API key', sev: 'high', re: /\bdd[a-z]?[_-]?api[_-]?key['"=:\s]+[a-f0-9]{32}\b/gi },
  { kind: 'Telegram bot token', sev: 'high', re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { kind: 'Shopify token', sev: 'critical', re: /\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b/g },
  { kind: 'Square access token', sev: 'critical', re: /\b(?:sq0atp|sq0csp|EAAA)[A-Za-z0-9_-]{22,}\b/g },
  { kind: 'Private key block', sev: 'critical', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: 'Azure storage AccountKey', sev: 'high', re: /AccountKey=[A-Za-z0-9+/=]{40,}/g },
  { kind: 'Azure SAS token', sev: 'high', re: /[?&]sig=[A-Za-z0-9%]{20,}&?/g },
  {
    kind: 'DB connection string with creds',
    sev: 'high',
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:\s/'"]+:[^@\s'"]+@/g,
  },
  { kind: 'JWT', sev: 'medium', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'Basic-auth in URL', sev: 'high', re: /\bhttps?:\/\/[^:\s/'"]+:[^@\s'"]+@[^\s'"]+/g },
];

const ASSIGN =
  /(?:api[_-]?key|secret|token|passwd|password|client[_-]?secret|access[_-]?token|auth)['"]?\s*[:=]\s*['"]([^'"\n]{12,})['"]/gi;

/** Shannon entropy (bits/char). */
function entropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  let e = 0;
  for (const k in freq) {
    const p = freq[k]! / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

function redact(s: string): string {
  if (s.length <= 12) return s[0] + '…' + s.slice(-1);
  return s.slice(0, 6) + '…' + s.slice(-4) + ` (${s.length} chars)`;
}

function lineOf(text: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

function analyze(text: string): { hits: Hit[] } | null {
  if (!text.trim()) return null;
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const push = (sev: Sev, kind: string, match: string, idx: number) => {
    const key = `${kind}:${match}:${idx}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ sev, kind, redacted: redact(match), line: lineOf(text, idx) });
  };

  for (const r of RULES) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text)) !== null) {
      push(r.sev, r.kind, m[1] ?? m[0], m.index);
      if (m.index === r.re.lastIndex) r.re.lastIndex++;
    }
  }

  // Generic high-entropy assignments not already covered by a signature.
  ASSIGN.lastIndex = 0;
  let a: RegExpExecArray | null;
  while ((a = ASSIGN.exec(text)) !== null) {
    const val = a[1]!;
    if (
      /^\$\{|^\{\{|^<|^%[A-Z_]+%$|^process\.env|^os\.environ|^env\.|example|changeme|your[_-]?|xxxx|placeholder|dummy|test1?23/i.test(
        val
      )
    )
      continue;
    if (val.length >= 16 && entropy(val) >= 3.6 && /[0-9]/.test(val) && /[A-Za-z]/.test(val))
      push('medium', 'High-entropy secret assignment', val, a.index);
  }

  hits.sort((x, y) => SEV_ORDER[x.sev] - SEV_ORDER[y.sev] || x.line - y.line);
  return { hits };
}

const SAMPLE = [
  '# config.env',
  'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwx',
  'STRIPE=sk_live_EXAMPLE_redacted_placeholder',
  'DATABASE_URL=postgres://app:S3cr3tP@ss@db.internal:5432/prod',
  'API_KEY="a9F3kZ1pQ7wL2mN8xV4tB6yR0sD5hJcU"',
].join('\n');

export default function SecretScanner(): JSX.Element {
  // NEVER sync the scanned text to the URL. This tool promises "nothing leaves
  // your browser"; mirroring the paste into ?q= would persist live credentials
  // in history, share-links, the Referer header, and extension-readable state.
  const [input, setInput] = useState('');
  const result = useMemo(() => analyze(input), [input]);

  const counts = useMemo(() => {
    const c: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    result?.hits.forEach((x) => (c[x.sev] += 1));
    return c;
  }, [result]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Secret / API-Key Scanner</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl">
          Paste code, <span className="font-mono text-tool">.env</span>, config, or CI logs. Cloud keys, VCS/CI/SaaS
          tokens, private keys, DB URIs and JWTs are matched by signature; generic high-entropy
          <span className="font-mono text-tool"> key="…"</span> assignments are flagged too. Redacted output, line
          numbers — <strong>nothing leaves your browser</strong>.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setInput(SAMPLE)}
            className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
          >
            load example
          </button>
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>
      </div>
      <label htmlFor="sec-input" className="sr-only">
        Text to scan for secrets
      </label>
      <textarea
        id="sec-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste code / .env / logs — scanned entirely in-browser, never uploaded."
        rows={12}
        spellCheck={false}
        aria-label="Text to scan for secrets"
        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />
      {result && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                <span className="text-slate-500">Findings:</span>{' '}
                <span className="font-mono">{result.hits.length}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {(['critical', 'high', 'medium', 'low', 'info'] as Sev[])
                  .filter((s) => counts[s] > 0)
                  .map((s) => (
                    <span
                      key={s}
                      className={`text-mini font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLE[s].chip}`}
                    >
                      {counts[s]} {s}
                    </span>
                  ))}
              </span>
            </div>
          </section>
          {result.hits.length === 0 && (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
              <span>
                No known secret signatures or high-entropy assignments found. Signature scanning isn’t exhaustive —
                still gate commits with a CI scanner.
              </span>
            </section>
          )}
          {result.hits.length > 0 && (
            <section className="space-y-2">
              {result.hits.map((hit, idx) => {
                const st = SEV_STYLE[hit.sev];
                return (
                  <div
                    key={`${hit.kind}-${idx}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <st.Icon size={15} className={`flex-shrink-0 ${st.text}`} />
                      <span
                        className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${st.chip}`}
                      >
                        {hit.sev}
                      </span>
                      <span className={`font-display font-semibold text-sm ${st.text}`}>{hit.kind}</span>
                      <span className="text-mini font-mono text-slate-500">line {hit.line}</span>
                      <code className="text-meta font-mono text-slate-700 dark:text-slate-300 break-all">
                        {hit.redacted}
                      </code>
                    </div>
                  </div>
                );
              })}
              <p className="text-meta text-slate-500 mt-3">
                Treat every match as live: <strong>rotate/revoke</strong> the credential, then purge it from git history
                (git-filter-repo / BFG) — deleting the line is not enough.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
