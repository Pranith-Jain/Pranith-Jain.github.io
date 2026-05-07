import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileSearch } from 'lucide-react';
import type { FileAnalysisResponse } from '../../lib/dfir/types';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { IocResultRow } from '../../components/dfir/IocResultRow';
import { recordHistory } from '../../lib/dfir/history';

const HASH_RE = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;

export default function File(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('hash') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FileAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = HASH_RE.test(input.trim());
  const detected = valid ? (input.trim().length === 32 ? 'MD5' : input.trim().length === 40 ? 'SHA-1' : 'SHA-256') : '';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch('/api/v1/file/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash: input.trim() }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${r.status}`);
      }
      const r2 = (await r.json()) as FileAnalysisResponse;
      setResult(r2);
      recordHistory({ tool: 'file', indicator: r2.hash, verdict: r2.verdict, score: r2.score });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'analysis failed');
    } finally {
      setLoading(false);
    }
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
        <h1 className="text-4xl font-display font-bold mb-2">File Analyzer</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Hash-based lookup across VirusTotal and Hybrid Analysis. Paste an MD5, SHA-1, or SHA-256 below.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="paste a file hash (MD5 / SHA-1 / SHA-256)"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
            {detected && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-brand-600 dark:text-brand-400 uppercase">
                {detected}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!valid || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <FileSearch size={16} className="inline mr-2" /> Analyze
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">Not a recognized hash length.</p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Analyzing…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h2 className="font-display font-bold text-2xl">Composite verdict</h2>
                <p className="mt-1 font-mono text-xs text-slate-500 break-all">
                  {result.hash} ({result.hash_type})
                </p>
              </div>
              <VerdictChip verdict={result.verdict} />
            </div>
            <div className="font-mono text-sm text-slate-600 dark:text-slate-400">
              score: <span className="text-slate-900 dark:text-slate-100">{result.score}</span> / 100 · confidence:{' '}
              <span className="text-slate-900 dark:text-slate-100">{result.confidence}</span>
            </div>
          </section>

          <section>
            <h3 className="font-display font-semibold mb-4 text-lg">Per-source</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {result.providers.map((p) => (
                <IocResultRow key={p.source} r={p} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
