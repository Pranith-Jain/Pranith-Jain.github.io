import { useState, useEffect, useCallback, useRef } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  Database,
  Search,
  Loader2,
  Shield,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

interface BloomStats {
  filters: Record<
    string,
    {
      ioc_count?: number;
      filter_size_bits?: number;
      num_hashes?: number;
      built_at?: string;
      false_positive_rate?: string;
      status?: string;
    }
  >;
  generated_at: string;
}

interface BloomCheckResult {
  indicator: string;
  type: string;
  found: boolean | null;
  confidence: string;
  message: string;
}

const VERDICT_STYLE: Record<string, { border: string; bg: string; icon: typeof Shield; text: string }> = {
  found: {
    border: 'border-rose-300/70 dark:border-rose-800/60',
    bg: 'bg-rose-50/60 dark:bg-rose-950/30',
    icon: AlertTriangle,
    text: 'text-rose-700 dark:text-rose-300',
  },
  'not-found': {
    border: 'border-emerald-300/70 dark:border-emerald-800/60',
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    icon: CheckCircle,
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  unknown: {
    border: 'border-amber-300/70 dark:border-amber-800/60',
    bg: 'bg-amber-50/60 dark:bg-amber-950/30',
    icon: HelpCircle,
    text: 'text-amber-700 dark:text-amber-300',
  },
};

export default function BloomFilter(): JSX.Element {
  const [stats, setStats] = useState<BloomStats | null>(null);
  const [query, setQuery] = useState('');
  const [checkResult, setCheckResult] = useState<BloomCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const statsRef = useRef<AbortController | null>(null);
  const checkRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    statsRef.current?.abort();
    const ctrl = new AbortController();
    statsRef.current = ctrl;
    setStatsLoading(true);
    try {
      const res = await fetch('/api/v1/bloom/stats', {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON');
      setStats((await res.json()) as BloomStats);
    } catch (_catchErr) {
      console.error('BloomFilter failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* silent */
    } finally {
      if (!ctrl.signal.aborted) setStatsLoading(false);
    }
  }, []);

  const buildFilter = useCallback(
    async (type: string) => {
      const ctrl = new AbortController();
      try {
        await fetch(`/api/v1/bloom/${type}`, { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]) });
        await fetchStats();
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* silent */
      }
    },
    [fetchStats]
  );

  const checkIndicator = useCallback(async () => {
    if (!query.trim()) return;
    checkRef.current?.abort();
    const ctrl = new AbortController();
    checkRef.current = ctrl;
    setLoading(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/v1/bloom/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indicator: query }),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON');
      setCheckResult((await res.json()) as BloomCheckResult);
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* silent */
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchStats();
    return () => {
      statsRef.current?.abort();
    };
  }, [fetchStats]);

  const verdict = checkResult?.found === true ? 'found' : checkResult?.found === false ? 'not-found' : 'unknown';
  const verdictStyle = (VERDICT_STYLE[verdict] ?? VERDICT_STYLE.unknown)!;
  const VerdictIcon = verdictStyle.icon;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Zap size={28} className="text-brand-600 dark:text-brand-400" /> Bloom Filter Lookup
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Ultra-fast probabilistic IOC membership testing. Zero false negatives — if the filter says "not found", the
          indicator is definitely not in the set.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5 mb-6">
        <h2 className="font-display font-bold text-sm mb-3">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-2.5">
            <Shield size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">No False Negatives</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                "Not found" means definitely not in the set.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Zap size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300">Lightning Fast</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Check thousands of IOCs per second.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Database size={16} className="text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium text-brand-700 dark:text-brand-300">Memory Efficient</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Compact representation in kilobytes.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Status */}
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-sm flex items-center gap-2">
            <Database size={14} className="text-brand-600 dark:text-brand-400" /> Filter Status
          </h2>
          <button
            onClick={fetchStats}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] text-slate-400 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {statsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(stats.filters).map(([type, filter]) => (
              <div
                key={type}
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div className="text-xs font-mono font-medium capitalize mb-1.5">{type}</div>
                {filter.status === 'not_built' ? (
                  <button
                    onClick={() => buildFilter(type)}
                    className="text-xs px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors"
                  >
                    Build
                  </button>
                ) : (
                  <div className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <div>{filter.ioc_count?.toLocaleString()} IOCs</div>
                    <div>FPR: {filter.false_positive_rate}</div>
                    <div className="text-micro text-slate-400">
                      {filter.built_at ? new Date(filter.built_at).toLocaleTimeString() : '—'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Failed to load filter stats</p>
        )}
      </div>

      {/* Lookup */}
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
        <h2 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
          <Search size={14} className="text-brand-600 dark:text-brand-400" /> Quick Lookup
        </h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void checkIndicator()}
            placeholder="Enter IP, domain, URL, or hash…"
            className="flex-1 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            onClick={() => void checkIndicator()}
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Check
          </button>
        </div>

        {checkResult && (
          <div className={`rounded-xl border ${verdictStyle.border} ${verdictStyle.bg} p-4 flex items-center gap-3`}>
            <VerdictIcon size={18} className={verdictStyle.text} />
            <div>
              <div className={`text-sm font-medium ${verdictStyle.text}`}>
                {checkResult.found === true
                  ? 'Might be in set'
                  : checkResult.found === false
                    ? 'Not in set'
                    : 'Unknown'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{checkResult.message}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
