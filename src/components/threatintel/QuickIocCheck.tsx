import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Search, Loader2, ArrowRight } from 'lucide-react';
import { streamIoc } from '../../lib/dfir/api';
import { detectType } from '../../lib/dfir/indicator-client';
import { VerdictChip } from '../dfir/VerdictChip';
import type { ProviderResultWire, DoneEvent, ProviderId } from '../../lib/dfir/types';

export default function QuickIocCheck() {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<ProviderId[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
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
      },
      onError: (e) => {
        setError(e);
        setStreaming(false);
      },
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Shield size={14} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        IOC Check
      </h4>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runCheck()}
          placeholder="IP, domain, URL, or hash…"
          className="flex-1 px-3 py-3 sm:py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
        <button
          onClick={runCheck}
          disabled={!canSubmit}
          className="px-3 py-3 sm:py-1.5 rounded bg-brand-600 dark:bg-brand-500 text-white text-xs font-mono disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          {streaming ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        </button>
      </div>

      {streaming && eligible.length > 0 && (
        <p className="mt-2 text-[10px] font-mono text-slate-500">
          scanning… {results.length}/{eligible.length} sources
        </p>
      )}

      {summary && (
        <div className="mt-3 flex items-center gap-2">
          <VerdictChip verdict={summary.verdict} />
          <span className="text-[10px] font-mono text-slate-500">{summary.score}/100</span>
          <span className="text-[10px] font-mono text-slate-500">{summary.confidence}</span>
        </div>
      )}

      {results.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
            Per-source verdicts ({results.length})
          </summary>
          <div className="mt-2 space-y-1">
            {results.map((r) => (
              <div
                key={r.source}
                className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 dark:bg-slate-950 text-[10px]"
              >
                <span className="font-mono text-slate-700 dark:text-slate-300 capitalize">{r.source}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">{r.score}</span>
                  <VerdictChip verdict={r.verdict} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {error && <p className="mt-2 text-[10px] font-mono text-rose-500">{error}</p>}

      {summary && (
        <Link
          to={`/dfir/ioc-check?indicator=${encodeURIComponent(input.trim())}`}
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          Open in IOC Checker <ArrowRight size={10} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
