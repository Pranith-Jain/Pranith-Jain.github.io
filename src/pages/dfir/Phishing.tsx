import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ScanText } from 'lucide-react';
import type { PhishingAnalysisResponse } from '../../lib/dfir/types';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { HeaderTable } from '../../components/dfir/HeaderTable';
import { AuthResultsChips } from '../../components/dfir/AuthResultsChips';
import { UrlList } from '../../components/dfir/UrlList';
import { recordHistory } from '../../lib/dfir/history';
import { RelatedActors } from '../../components/dfir/RelatedActors';

export default function Phishing(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('q') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PhishingAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch('/api/v1/phishing/analyze', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: input,
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${r.status}`);
      }
      const r2 = (await r.json()) as PhishingAnalysisResponse;
      setResult(r2);
      const indicator = String(r2.headers['subject'] ?? r2.headers['from'] ?? 'email');
      recordHistory({ tool: 'phishing', indicator, verdict: r2.verdict, score: r2.score });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Phishing Email Analyzer</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Paste raw email source. We parse headers, check SPF/DKIM/DMARC results, extract URLs, and compute a risk
          score. URLs link straight into the IOC checker.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste raw email here (View Original / Show Source from your mail client)"
          rows={12}
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <ScanText size={16} className="inline mr-2" /> Analyze
          </button>
        </div>
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Analyzing...</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-bold text-2xl">Risk verdict</h2>
              <VerdictChip verdict={result.verdict} />
            </div>
            <div className="font-mono text-sm text-slate-600 dark:text-slate-400">
              score: <span className="text-slate-900 dark:text-slate-100">{result.score}</span> / 100
            </div>
            {result.flags.length > 0 && (
              <ul className="mt-3 space-y-1 list-disc list-inside text-sm text-slate-600 dark:text-slate-400">
                {result.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </section>
          <AuthResultsChips auth={result.auth} />
          <HeaderTable headers={result.headers} />
          <UrlList urls={result.urls} />
          <RelatedActors
            hints={{
              tags: ['phishing', 'spear-phishing'],
              techniques: ['T1566.001', 'T1566.002'],
              free_text: result.urls,
            }}
          />
        </div>
      )}
    </div>
  );
}
