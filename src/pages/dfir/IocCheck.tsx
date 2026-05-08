import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { detectType, detectHashSubtype } from '../../lib/dfir/indicator-client';
import { streamIoc } from '../../lib/dfir/api';
import type { ProviderResultWire, DoneEvent, ProviderId } from '../../lib/dfir/types';
import { IocResultRow } from '../../components/dfir/IocResultRow';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { recordHistory } from '../../lib/dfir/history';
import { RelatedActors } from '../../components/dfir/RelatedActors';

export default function IocCheck(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('indicator') ?? '';
  const [input, setInput] = useState(initialInput);
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<ProviderId[]>([]);
  const detectedType = input ? detectType(input) : 'unknown';
  const canSubmit = !!input.trim() && detectedType !== 'unknown' && !streaming;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
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
      },
      onError: (e) => {
        setError(e);
        setStreaming(false);
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">IOC Checker</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          IPs, domains, URLs, and file hashes — checked across 8 threat intel sources in parallel.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="paste an IP, domain, URL, or hash"
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
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">Unrecognized indicator format.</p>
        )}
      </form>

      {summary && (
        <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-display font-bold text-2xl">Composite verdict</h2>
            <VerdictChip verdict={summary.verdict} />
          </div>
          <div className="flex items-center gap-4 font-mono text-sm text-slate-600 dark:text-slate-400">
            <span>
              score: <span className="text-slate-900 dark:text-slate-100">{summary.score}</span> / 100
            </span>
            <span>
              confidence: <span className="text-slate-900 dark:text-slate-100">{summary.confidence}</span>
            </span>
            <span>
              {summary.contributing} of {eligible.length} responding
            </span>
          </div>
        </section>
      )}

      {(streaming || results.length > 0) && (
        <section>
          <h3 className="font-display font-semibold mb-4 text-lg">Per-source</h3>
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
        </section>
      )}

      {error && <p className="mt-6 text-sm font-mono text-rose-600 dark:text-rose-400">stream error: {error}</p>}

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
    </div>
  );
}
