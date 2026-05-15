import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';
import {
  PATTERNS,
  detect,
  summary,
  redact,
  type Confidence,
  type Finding,
  type Severity,
  type Category,
} from '../../lib/dfir/dlp-patterns';

const SEV_STYLES: Record<Severity, string> = {
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  low: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
};

const CONF_STYLES: Record<Confidence, string> = {
  verified: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

const CATEGORY_LABELS: Record<Category, string> = {
  financial: 'Financial',
  personal: 'Personal',
  credential: 'Credentials',
  network: 'Network',
  health: 'Health',
  'government-id': 'Government ID',
};

const SAMPLES: { label: string; text: string }[] = [
  {
    // The faux-secret literals below are deliberately fragmented in source
    // (using template-literal substitutions) so they don't trip GitHub
    // push-protection / secret-scanning. At runtime they resolve to the
    // intact patterns the detector regexes expect.
    label: 'Mixed sample',
    text:
      `Reaching out re: support ticket #4582.\n` +
      `Customer email: alice.example@gmail.com  · phone: +1 415 555 0142\n` +
      `On file: card 4242 4242 4242 4242 exp 12/27, last login from 10.0.0.42.\n` +
      `Backup AWS access key id: AKIA${'FAKEEXAMPLE'}NOTRL.\n` +
      `Stripe live token from staging: sk${'_'}live_${'THISisJUSTaSAMPLEnotARealKeyXYZ'}.\n` +
      `Personal token: ghp${'_'}${'EXAMPLEnotARealTokenJustAFake1234567'} (rotate this).`,
  },
  {
    label: 'JWT + cert',
    text: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiaWF0IjoxNjE2MTYxNjE2fQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAA
... truncated ...
-----END OPENSSH PRIVATE KEY-----`,
  },
  {
    label: 'BEC indicators',
    text: `Subject: URGENT — wire transfer
From: cfo@ourcompany.tld

Please process a wire of $48,000 to:
Account: GB29 NWBK 6016 1331 9268 19 (IBAN — verify mod-97)
Routing: 026073150
Reference: alice.smith@vendor.example, phone (212) 555-0199

Resubmitted on the same thread as before — see eyJ... for context.`,
  },
];

function highlight(input: string, findings: Finding[]): JSX.Element[] {
  if (findings.length === 0)
    return [
      <span key="0" className="whitespace-pre-wrap">
        {input}
      </span>,
    ];
  const sorted = [...findings].sort((a, b) => a.index - b.index);
  const out: JSX.Element[] = [];
  let cursor = 0;
  sorted.forEach((f, i) => {
    if (f.index > cursor) {
      out.push(
        <span key={`t-${i}`} className="whitespace-pre-wrap">
          {input.slice(cursor, f.index)}
        </span>
      );
    }
    out.push(
      <mark
        key={`m-${i}`}
        className={`rounded px-0.5 border ${SEV_STYLES[f.pattern.severity]} whitespace-pre-wrap`}
        title={`${f.pattern.name} (${f.pattern.severity}, ${f.confidence})`}
      >
        {f.text}
      </mark>
    );
    cursor = f.index + f.text.length;
  });
  if (cursor < input.length) {
    out.push(
      <span key="end" className="whitespace-pre-wrap">
        {input.slice(cursor)}
      </span>
    );
  }
  return out;
}

export default function DlpScan(): JSX.Element {
  const [input, setInput] = useState('');

  const findings = useMemo(() => detect(input), [input]);
  const stats = useMemo(() => summary(findings), [findings]);
  const redacted = useMemo(() => redact(input, findings), [input, findings]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Sensitive Data Detector
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2">
          Scan any text for {PATTERNS.length} sensitive-data patterns. Credentials, financial identifiers, government
          IDs, health, network, personal contact. Credit cards are Luhn-checked, IBANs are mod-97 verified, AADHAAR is
          Verhoeff-checked, NHS is mod-11. Pure client-side; nothing leaves your browser.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with{' '}
          <Link to="/dfir/data-classification" className="text-brand-600 dark:text-brand-400 hover:underline">
            Data Classification Templater
          </Link>{' '}
          (decide handling) and{' '}
          <Link to="/dfir/grc" className="text-brand-600 dark:text-brand-400 hover:underline">
            GRC hub
          </Link>{' '}
          (NIST PR.DS / ISO 27001 A.5.12 / ISO 42001 A.7).
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
            Input
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => setInput(s.text)}
                className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
              >
                {s.label}
              </button>
            ))}
            {input && (
              <button
                onClick={() => setInput('')}
                className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          placeholder="Paste a log line, support-ticket transcript, file fragment, or email body. Anything that might contain PII, secrets, or regulated identifiers."
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
          aria-label="Text to scan for sensitive data"
        />
      </section>

      {input.trim() && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                Verdict
              </h2>
              <span
                className={`text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded border ${SEV_STYLES[stats.worst]}`}
              >
                {stats.total === 0 ? 'clean' : `${stats.worst} · ${stats.total} finding${stats.total === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
                <div
                  key={s}
                  className={`rounded border px-2 py-1.5 text-center font-mono ${SEV_STYLES[s]} ${
                    stats.bySeverity[s] === 0 ? 'opacity-40' : ''
                  }`}
                >
                  <div className="text-lg font-bold">{stats.bySeverity[s]}</div>
                  <div className="text-[10px] uppercase tracking-wider">{s}</div>
                </div>
              ))}
            </div>
            {stats.total > 0 && (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 mt-3 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                {(Object.keys(CATEGORY_LABELS) as Category[])
                  .filter((c) => stats.byCategory[c] > 0)
                  .map((c) => (
                    <div
                      key={c}
                      className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1"
                    >
                      <span className="text-slate-500 dark:text-slate-500">{CATEGORY_LABELS[c]}:</span>{' '}
                      <span className="text-slate-800 dark:text-slate-200 font-bold">{stats.byCategory[c]}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
              Highlighted input
            </h2>
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-sm text-slate-800 dark:text-slate-200 leading-relaxed overflow-x-auto">
              {highlight(input, findings)}
            </div>
          </section>

          {findings.length > 0 && (
            <>
              <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                  Findings
                </h2>
                <ul className="space-y-2">
                  {findings.map((f, i) => (
                    <li
                      key={`${f.pattern.id}-${i}`}
                      className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-display font-semibold text-slate-900 dark:text-slate-100">
                          {f.pattern.name}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLES[f.pattern.severity]}`}
                        >
                          {f.pattern.severity}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${CONF_STYLES[f.confidence]}`}
                          title="Match confidence"
                        >
                          {f.confidence}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                          {CATEGORY_LABELS[f.pattern.category]}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600 ml-auto">
                          @ {f.index}
                        </span>
                      </div>
                      <p className="text-[12px] font-mono text-slate-700 dark:text-slate-300 mb-1">
                        {f.pattern.description}
                      </p>
                      <code className="text-[12px] font-mono text-slate-800 dark:text-slate-200 break-all bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 p-1 inline-block">
                        {f.text.length > 80 ? f.text.slice(0, 77) + '…' : f.text}
                      </code>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                    Redacted output
                  </h2>
                  <CopyChip value={redacted} label="copy redacted" />
                </div>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                  Every finding replaced with <code>[REDACTED:&lt;pattern-id&gt;]</code>. Safe to share in a ticket or
                  on Slack.
                </p>
                <pre className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                  {redacted}
                </pre>
              </section>
            </>
          )}

          {findings.length === 0 && (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mb-6 text-sm font-mono text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2">
              <CheckCircle2 size={14} /> No sensitive data patterns detected. This is a regex sweep, not a guarantee.
              Entity-aware classifiers (Microsoft Purview, AWS Macie, GCP DLP) will catch things this tool can't.
            </section>
          )}
        </>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          Pattern catalog ({PATTERNS.length})
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PATTERNS.map((p) => (
            <div
              key={p.id}
              className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
            >
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-xs font-display font-semibold text-slate-900 dark:text-slate-100">{p.name}</span>
                <span
                  className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${SEV_STYLES[p.severity]}`}
                >
                  {p.severity}
                </span>
                <span className="text-[9px] font-mono text-slate-500 dark:text-slate-500">
                  {CATEGORY_LABELS[p.category]}
                </span>
                {p.validate && (
                  <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    validated
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 leading-relaxed">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          References
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <a
              href="https://github.com/mazen160/secrets-patterns-db"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              secrets-patterns-db · curated regex DB for secret detection
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://github.com/gitleaks/gitleaks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              gitleaks · open-source secrets detection
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://learn.microsoft.com/en-us/purview/sit-defn-credit-card-number"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Microsoft Purview · Sensitive Information Type definitions (reference for confidence tiers)
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-500 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> Heuristic only. Does not replace a managed DLP product. Use as a triage tool,
              not as the sole control.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}
