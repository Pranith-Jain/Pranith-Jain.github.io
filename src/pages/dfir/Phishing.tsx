import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ScanText } from 'lucide-react';
import type { PhishingAnalysisResponse } from '../../lib/dfir/types';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { HeaderTable } from '../../components/dfir/HeaderTable';
import { AuthResultsChips } from '../../components/dfir/AuthResultsChips';
import { UrlList } from '../../components/dfir/UrlList';
import { recordHistory } from '../../lib/dfir/history';

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
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <h1 className="text-4xl font-display font-bold mb-2">Phishing Email Analyzer</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          Paste raw email source. We parse headers, check SPF/DKIM/DMARC results, extract URLs, and compute a risk
          score. URLs link straight into the IOC checker.
        </p>

        <form onSubmit={onSubmit} className="mb-10">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste raw email here (View Original / Show Source from your mail client)"
            rows={12}
            className="w-full px-4 py-3 bg-[#111113] border border-[#1f1f23] rounded-lg font-mono text-xs text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#00fff9]/50"
          />
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-5 py-3 bg-[#00fff9] text-[#0a0a0a] font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-[#22d3ee]"
            >
              <ScanText size={16} className="inline mr-2" /> Analyze
            </button>
          </div>
        </form>

        {loading && <p className="font-mono text-[#a1a1aa]">Analyzing...</p>}
        {error && <p className="font-mono text-[#ef4444]">error: {error}</p>}

        {result && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display font-bold text-2xl">Risk verdict</h2>
                <VerdictChip verdict={result.verdict} />
              </div>
              <div className="font-mono text-sm text-[#a1a1aa]">
                score: <span className="text-[#fafafa]">{result.score}</span> / 100
              </div>
              {result.flags.length > 0 && (
                <ul className="mt-3 space-y-1 list-disc list-inside text-sm text-[#a1a1aa]">
                  {result.flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </section>
            <AuthResultsChips auth={result.auth} />
            <HeaderTable headers={result.headers} />
            <UrlList urls={result.urls} />
          </div>
        )}
      </div>
    </div>
  );
}
