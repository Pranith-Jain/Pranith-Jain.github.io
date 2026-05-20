import { useState, useRef, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, ShieldAlert, ShieldCheck, AlertCircle } from 'lucide-react';
import { detectType, detectHashSubtype } from '../../lib/dfir/indicator-client';
import { streamIoc } from '../../lib/dfir/api';
import type { ProviderResultWire, DoneEvent, ProviderId } from '../../lib/dfir/types';
import { IocResultRow } from '../../components/dfir/IocResultRow';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { recordHistory } from '../../lib/dfir/history';
import { RelatedActors } from '../../components/dfir/RelatedActors';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

interface NextStep {
  tone: 'malicious' | 'suspicious' | 'clean';
  title: string;
  steps: string[];
}

function buildNextSteps(verdict: string, type: string): NextStep {
  if (verdict === 'malicious') {
    const steps = [
      'Block at the perimeter (firewall, DNS sinkhole, mail-gateway, or proxy ACL) immediately.',
      'Search SIEM and proxy logs for the last 30 days of matches; pivot on any source IPs that touched it.',
      'Scope the blast radius: which hosts, which users, which sessions resolved or connected to it?',
    ];
    if (type === 'url' || type === 'domain') {
      steps.push('Submit the URL to URLhaus or PhishTank to help other defenders.');
      steps.push('Check if your DMARC policy is set to reject — phishing campaigns abuse weak SPF/DMARC.');
    }
    if (type === 'ipv4' || type === 'ipv6') {
      steps.push('Add to your perimeter blocklist; consider rate-limiting the entire ASN if abuse is widespread.');
    }
    if (type === 'hash' || type === 'md5' || type === 'sha1' || type === 'sha256') {
      steps.push('Hunt the hash across EDR. Quarantine endpoints if matches found.');
      steps.push('Pull a sample to a sandbox (Hybrid Analysis, ANY.RUN) for behavioural confirmation.');
    }
    return { tone: 'malicious', title: 'Confirmed malicious — recommended actions', steps };
  }
  if (verdict === 'suspicious') {
    return {
      tone: 'suspicious',
      title: 'Mixed signals — recommended actions',
      steps: [
        "Treat as untrusted until cleared. Don't auto-allow if it appears in user-reported phishing or alerts.",
        'Cross-check with other tools: Domain Lookup for registration age, Subdomain Takeover for dangling pointers, URL Preview for content inspection.',
        'Search your logs for prior interactions; one signal in isolation is rarely enough to act on.',
        'Re-run in 24h — providers update their feeds frequently and a "suspicious" verdict often hardens or clears within a day.',
      ],
    };
  }
  return {
    tone: 'clean',
    title: 'No active threat signal — operational notes',
    steps: [
      'Clean now does not mean clean tomorrow. Re-check periodically if this indicator stays in scope.',
      'A clean verdict on a freshly-registered domain or recently-rotated IP is weaker evidence than for a long-established asset.',
      'If you reached this tool because of an alert, document the false-positive context so future analysts have the trail.',
    ],
  };
}

export default function IocCheck(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('indicator') ?? '';
  const [input, setInput] = useState(initialInput);
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<ProviderId[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const detectedType = input ? detectType(input) : 'unknown';
  const canSubmit = !!input.trim() && detectedType !== 'unknown' && !streaming;

  const runCheck = () => {
    if (!canSubmit) return;
    setStreaming(true);
    setResults([]);
    setSummary(null);
    setError(null);
    setEligible([]);

    streamIoc(input.trim(), {
      onMeta: (m) => setEligible(m.providers),
      onResult: (r) => setResults((prev) => [...prev, r]),
      onDone: (s) => {
        setSummary(s);
        setStreaming(false);
        recordHistory({ tool: 'ioc', indicator: input.trim(), verdict: s.verdict, score: s.score });
        setTimeout(() => summaryRef.current?.focus(), 0);
      },
      onError: (e) => {
        setError(e);
        setStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      },
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runCheck();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">IOC Checker</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Check IPs, domains, URLs, and file hashes against 26 threat intelligence sources in parallel. Streaming
          verdicts, weighted scoring, and tagged evidence for every IOC.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <label htmlFor="ioc-input" className="sr-only">
          Indicator of compromise (IP, domain, URL, or hash)
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              id="ioc-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="paste an IP, domain, URL, or hash"
              aria-label="Indicator of compromise"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
            {input && detectedType !== 'unknown' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-brand-600 dark:text-brand-400 uppercase">
                {detectedType === 'hash'
                  ? (() => {
                      const sub = detectHashSubtype(input);
                      if (sub === 'md5') return 'MD5';
                      if (sub === 'sha1') return 'SHA-1';
                      if (sub === 'sha256') return 'SHA-256';
                      return 'HASH';
                    })()
                  : detectedType}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" />
            Check
          </button>
        </div>
        {input && detectedType === 'unknown' && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Unrecognized format. Accepted: IPv4 (e.g. <code className="font-semibold">1.1.1.1</code>), IPv6, domain
            (e.g. <code className="font-semibold">example.com</code>), URL (with scheme), or file hash (MD5 / SHA-1 /
            SHA-256).
          </p>
        )}
      </form>

      {summary &&
        (() => {
          const next = buildNextSteps(summary.verdict, detectedType);
          const toneStyles =
            next.tone === 'malicious'
              ? 'border-rose-300 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-900/15 text-rose-900 dark:text-rose-200'
              : next.tone === 'suspicious'
                ? 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/15 text-amber-900 dark:text-amber-200'
                : 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/15 text-emerald-900 dark:text-emerald-200';
          const Icon = next.tone === 'malicious' ? ShieldAlert : next.tone === 'suspicious' ? AlertCircle : ShieldCheck;
          return (
            <>
              <section className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 ref={summaryRef} tabIndex={-1} className="font-display font-bold text-2xl focus:outline-none">
                    Composite verdict
                  </h2>
                  <VerdictChip verdict={summary.verdict} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    score: <span className="font-semibold text-slate-900 dark:text-slate-100">{summary.score}</span> /
                    100
                  </span>
                  <span>
                    confidence:{' '}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{summary.confidence}</span>
                  </span>
                  <span>
                    {summary.contributing} of {eligible.length} responding
                  </span>
                </div>
              </section>
              <section className={`mb-8 rounded-2xl border p-5 ${toneStyles}`}>
                <h3 className="font-display font-semibold text-base mb-3 inline-flex items-center gap-2">
                  <Icon size={16} aria-hidden="true" /> {next.title}
                </h3>
                <ul className="space-y-1.5 text-sm leading-relaxed">
                  {next.steps.map((s) => (
                    <li key={s} className="flex gap-2">
                      <span className="opacity-50 select-none">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          );
        })()}

      {(streaming || results.length > 0) && (
        <section aria-busy={streaming && eligible.length === 0} aria-live="polite" aria-atomic="true">
          <h3 className="font-display font-semibold mb-4 text-lg">Per-source</h3>
          {streaming && eligible.length === 0 ? (
            <p className="text-xs font-mono text-slate-500 dark:text-slate-500 animate-pulse">
              opening stream — waiting for eligible providers…
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {eligible.map((p) => {
                const r = results.find((res) => res.source === p);
                if (r) return <IocResultRow key={p} r={r} />;
                return (
                  <div
                    key={p}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 animate-pulse"
                  >
                    <span className="font-display capitalize text-slate-600 dark:text-slate-400">{p}</span>
                    <span className="block mt-2 text-xs font-mono text-slate-500">querying…</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/15 p-4 flex items-start justify-between gap-3"
        >
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300">
            <span className="font-semibold">stream error:</span> {error}
          </div>
          <button
            type="button"
            onClick={runCheck}
            className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-rose-400/60 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
          >
            retry
          </button>
        </div>
      )}

      {summary && (
        <div className="mt-6">
          <RelatedActors
            hints={{
              tags: results.flatMap((r) => r.tags),
              free_text: results.flatMap(
                (r) => Object.values(r.raw_summary).filter((v) => typeof v === 'string') as string[]
              ),
            }}
          />
        </div>
      )}
      <RelatedWikiArticles />
    </div>
  );
}
