import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, AlertTriangle, Activity } from 'lucide-react';

export default function ThreatHunt(): JSX.Element {
  const [query, setQuery] = useState('');
  const [hunting, setHunting] = useState(false);
  const [result, setResult] = useState<{
    q: string;
    type: string;
    telegram_leak_hits: number;
    ioc_link: string;
    hunt_link: string;
  } | null>(null);

  const doHunt = async () => {
    const q = query.trim();
    if (!q || q.length < 3) return;
    setHunting(true);
    setResult(null);
    try {
      const r = await fetch(`/api/v1/threat-hunt?q=${encodeURIComponent(q)}`);
      if (r.ok) setResult((await r.json()) as typeof result);
    } catch {
      /* ignore */
    }
    setHunting(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Search size={28} className="text-brand-600 dark:text-brand-400" /> Automated Threat Hunt
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
          Hunt an IP, domain, email, or hash across Telegram leaks, breach sources, and 42 IOC providers.
        </p>
      </div>

      {/* Input */}
      <div className="mb-8">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doHunt()}
            placeholder="IP, domain, email, or hash..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <button
            onClick={doHunt}
            disabled={hunting || query.length < 3}
            className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {hunting ? 'Hunting...' : 'Hunt'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="animate-fade-in-up space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
                {result.type}
              </span>
              <code className="text-sm font-mono text-brand-600 dark:text-brand-400">{result.q}</code>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3">
                <p className="text-[11px] font-mono text-slate-500 mb-1">Telegram Leaks</p>
                <p className="text-xl font-bold font-display">{result.telegram_leak_hits}</p>
              </div>
              <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3">
                <p className="text-[11px] font-mono text-slate-500 mb-1">Breach Sources</p>
                <p className="text-xl font-bold font-display flex items-center gap-2">
                  7
                  <Activity size={14} className="text-emerald-500" />
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3">
                <p className="text-[11px] font-mono text-slate-500 mb-1">IOC Providers</p>
                <p className="text-xl font-bold font-display flex items-center gap-2">
                  42
                  <Activity size={14} className="text-emerald-500" />
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={result.hunt_link}
              className="block rounded-xl border border-brand-500/30 bg-brand-500/5 p-4 hover:border-brand-500/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Search size={18} className="text-brand-600 dark:text-brand-400 shrink-0" />
                <div>
                  <h3 className="font-display font-semibold text-sm">Deep IOC Check →</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Full scan across 42 IOC providers with verdict, confidence score, and pivoting
                  </p>
                </div>
              </div>
            </a>
            <a
              href={`/dfir/breach?q=${encodeURIComponent(result.q)}`}
              className="block rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 hover:border-rose-500/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-rose-500 shrink-0" />
                <div>
                  <h3 className="font-display font-semibold text-sm">Breach Check →</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Search 7 breach databases for this indicator</p>
                </div>
              </div>
            </a>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !hunting && (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
          <Search size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-mono">Enter an IP, domain, email, or hash to start hunting</p>
        </div>
      )}
    </div>
  );
}
