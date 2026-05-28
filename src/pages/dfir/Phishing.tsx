import { useState, useRef, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ScanText, Search, Crosshair, Fingerprint, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PhishingAnalysisResponse } from '../../lib/dfir/types';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { HeaderTable } from '../../components/dfir/HeaderTable';
import { AuthResultsChips } from '../../components/dfir/AuthResultsChips';
import { UrlList } from '../../components/dfir/UrlList';
import { recordHistory } from '../../lib/dfir/history';
import { RelatedActors } from '../../components/dfir/RelatedActors';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';
import { structuralFingerprint, submitFingerprint, type FingerprintResult } from '../../lib/dfir/phishing-fingerprint';

export default function Phishing(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialInput = searchParams.get('q') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PhishingAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fpUrl, setFpUrl] = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpResult, setFpResult] = useState<FingerprintResult | null>(null);
  const [fpHash, setFpHash] = useState<string | null>(null);
  const [fpError, setFpError] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const runFingerprint = async () => {
    const url = fpUrl.trim();
    if (!url) return;
    setFpLoading(true);
    setFpResult(null);
    setFpHash(null);
    setFpError(null);
    try {
      const r = await fetch('/api/v1/phishing/fetch-page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `${r.status}`);
      }
      const { html } = (await r.json()) as { html: string };
      const hash = await structuralFingerprint(html);
      setFpHash(hash);
      const fp = await submitFingerprint(hash, url);
      setFpResult(fp);
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'fingerprint failed');
    } finally {
      setFpLoading(false);
    }
  };

  const sendToExtractor = () => {
    if (!input.trim()) return;
    try {
      sessionStorage.setItem('ioc-extractor-pipe', input);
    } catch {
      /* sessionStorage unavailable — silent */
    }
    navigate('/dfir/extract?from=phishing');
  };

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
      setTimeout(() => resultRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Phishing Email Analyzer</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Paste raw email source. We parse headers, check SPF/DKIM/DMARC results, extract URLs, and compute a risk
          score. URLs link straight into the IOC checker.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <label htmlFor="phishing-input" className="sr-only">
          Raw email source for phishing analysis
        </label>
        <textarea
          id="phishing-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste raw email here (View Original / Show Source from your mail client)"
          rows={6}
          aria-label="Raw email source"
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 sm:rows-12"
          style={{ minHeight: '12rem' }}
        />
        <div className="mt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-full sm:w-auto px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center justify-center gap-2"
          >
            <ScanText size={16} /> Analyze
          </button>
        </div>
      </form>

      {loading && (
        <p role="status" className="font-mono text-slate-600 dark:text-slate-400">
          Analyzing...
        </p>
      )}
      {error && (
        <p role="alert" className="font-mono text-rose-600 dark:text-rose-400">
          error: {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <h2 ref={resultRef} tabIndex={-1} className="font-display font-bold text-2xl focus:outline-none">
                Risk verdict
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={sendToExtractor}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20"
                  title="Send the raw email body to the IOC Extractor for full URL/IP/domain/hash extraction"
                >
                  <Search size={11} /> extract IOCs from raw →
                </button>
                <VerdictChip verdict={result.verdict} />
              </div>
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
          {result.urls.length > 0 && (
            <div className="flex gap-2">
              <Link
                to={`/dfir/url-rep?url=${encodeURIComponent(result.urls[0])}`}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
              >
                <Crosshair size={11} /> Check all URLs ({result.urls.length})
              </Link>
            </div>
          )}
          <RelatedActors
            hints={{
              tags: ['phishing', 'spear-phishing'],
              techniques: ['T1566.001', 'T1566.002'],
              free_text: result.urls,
            }}
          />
        </div>
      )}
      <section className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-lg font-display font-bold mb-2 flex items-center gap-2">
          <Fingerprint size={16} className="text-brand-600 dark:text-brand-400" />
          Phishing Kit Fingerprint
        </h2>
        <p className="text-xs text-slate-500 mb-4 max-w-xl">
          Paste a suspected phishing URL. The page content is fetched server-side, then a structural fingerprint
          (stripped of text/scripts/styles) is hashed in your browser and checked against known kits. Only the hash
          leaves your browser.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={fpUrl}
            onChange={(e) => setFpUrl(e.target.value)}
            placeholder="https://phishing-site.example.com/login"
            aria-label="Phishing URL to fingerprint"
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="button"
            onClick={() => void runFingerprint()}
            disabled={fpLoading || !fpUrl.trim()}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 disabled:opacity-40"
          >
            {fpLoading && <Loader2 size={12} className="animate-spin" />}
            {fpLoading ? 'fingerprinting…' : 'fingerprint'}
          </button>
        </div>
        {fpError && (
          <p className="mt-3 text-xs font-mono text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertTriangle size={12} /> {fpError}
          </p>
        )}
        {fpResult && fpHash && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              {fpResult.match ? (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={12} /> Known kit
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={12} /> New fingerprint
                </span>
              )}
              {fpResult.count && (
                <span className="text-[10px] font-mono text-slate-500">
                  seen {fpResult.count} time{fpResult.count === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {fpResult.first_seen && (
              <p className="text-[11px] font-mono text-slate-500">
                first seen: {new Date(fpResult.first_seen).toLocaleString()}
              </p>
            )}
            {fpResult.urls && fpResult.urls.length > 0 && (
              <div className="text-[11px] font-mono text-slate-500">
                <span className="text-slate-600 dark:text-slate-400">sample URLs:</span>
                <ul className="mt-1 space-y-0.5">
                  {fpResult.urls.map((u) => (
                    <li key={u} className="truncate max-w-lg" title={u}>
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[10px] font-mono text-slate-500 break-all" title={fpHash}>
              hash: {fpHash.slice(0, 16)}…{fpHash.slice(-8)}
            </p>
          </div>
        )}
      </section>
      <RelatedWikiArticles />
    </div>
  );
}
