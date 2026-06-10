import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, ExternalLink, Globe } from 'lucide-react';
import { streamIoc } from '../../lib/dfir/api';
import type { ProviderResultWire, DoneEvent, ProviderId } from '../../lib/dfir/types';
import { IocResultRow } from '../../components/dfir/IocResultRow';
import { VerdictChip } from '../../components/dfir/VerdictChip';

const URL_RE = /^https?:\/\/.+/i;

export default function UrlReputation(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialUrl = searchParams.get('url') ?? '';
  const [input, setInput] = useState(initialUrl);
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<ProviderId[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const valid = URL_RE.test(input.trim());
  const canSubmit = valid && !streaming;

  const runCheck = useCallback(() => {
    const v = input.trim();
    if (!URL_RE.test(v)) return;
    setStreaming(true);
    setResults([]);
    setSummary(null);
    setError(null);
    setEligible([]);
    cancelRef.current = streamIoc(v, {
      onMeta: (m) => setEligible(m.providers),
      onResult: (r) => setResults((prev) => [...prev, r]),
      onDone: (s) => {
        setSummary(s);
        setStreaming(false);
        setTimeout(() => summaryRef.current?.focus(), 0);
      },
      onError: (e) => {
        setError(e);
        setStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      },
    });
  }, [input]);

  useEffect(() => {
    if (initialUrl && URL_RE.test(initialUrl)) runCheck();
    return () => cancelRef.current?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const domain = useMemo(() => {
    try {
      return input.trim() ? new URL(input.trim()).hostname : '';
    } catch {
      return '';
    }
  }, [input]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> URL Reputation
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Check a URL against 20+ threat intelligence sources in parallel. Get a composite verdict with per-source
          scores, tags, and evidence — powered by the same streaming pipeline as the IOC Checker.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCheck();
        }}
        className="mb-6"
      >
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://example.com/path?param=value"
              className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="URL to check"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" /> Check
          </button>
        </div>
        {input.trim() && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Enter a full URL with scheme (https://…)
          </p>
        )}
      </form>

      {streaming && eligible.length === 0 && (
        <p className="text-xs font-mono text-slate-500 animate-pulse mb-4">opening stream — waiting for providers…</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-mono text-rose-600 dark:text-rose-400 mb-4">
          error: {error}
        </p>
      )}

      {summary && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 ref={summaryRef} tabIndex={-1} className="font-display font-bold text-lg focus:outline-none">
              Composite verdict
            </h2>
            <VerdictChip verdict={summary.verdict} />
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-sm text-slate-600 dark:text-slate-400">
            <span>
              score: <span className="font-semibold text-slate-900 dark:text-slate-100">{summary.score}</span>/100
            </span>
            <span>
              confidence: <span className="font-semibold text-slate-900 dark:text-slate-100">{summary.confidence}</span>
            </span>
            <span>
              {summary.contributing}/{eligible.length} sources
            </span>
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
              Per-source results
            </h3>
            <span className="text-mini font-mono text-slate-500">
              {streaming ? 'streaming…' : `${results.length} sources`}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {results.map((r) => (
              <IocResultRow key={r.source} r={r} />
            ))}
          </div>
        </section>
      )}

      {!streaming && !summary && !error && domain && (
        <div className="flex gap-2 mt-4 flex-wrap">
          <Link
            to={`/dfir/domain?domain=${encodeURIComponent(domain)}`}
            className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
          >
            <ExternalLink size={10} /> Domain lookup
          </Link>
          <Link
            to={`/dfir/url-preview?url=${encodeURIComponent(input.trim())}`}
            className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
          >
            <ExternalLink size={10} /> URL Preview
          </Link>
          <Link
            to={`/dfir/ioc-check?indicator=${encodeURIComponent(input.trim())}`}
            className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
          >
            <ExternalLink size={10} /> IOC Checker
          </Link>
          <Link
            to={`/dfir/email-rep?domain=${encodeURIComponent(domain)}`}
            className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
          >
            <ExternalLink size={10} /> Email Reputation
          </Link>
        </div>
      )}
    </div>
  );
}
