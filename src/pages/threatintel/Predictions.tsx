import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, ShieldAlert, Cpu, Brain, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

type Bucket = 'cyber' | 'tech' | 'ai';

interface Outcome {
  name: string;
  price: number;
}

interface PredictionMarket {
  question: string;
  slug: string;
  url: string;
  probability: number;
  outcomes: Outcome[];
  volume: number;
  liquidity: number;
  end_date: string | null;
  bucket: Bucket;
  tags: string[];
}

interface PredictionsResponse {
  total: number;
  buckets: Record<Bucket, PredictionMarket[]>;
  timestamp: string;
  source: string;
}

const BUCKET_META: Record<Bucket, { label: string; icon: typeof TrendingUp; accent: string; bar: string }> = {
  cyber: {
    label: 'Cyber Threat',
    icon: ShieldAlert,
    accent: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-100 dark:bg-rose-500/10',
    bar: 'bg-rose-500',
  },
  ai: {
    label: 'AI',
    icon: Brain,
    accent: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-100 dark:bg-rose-500/10',
    bar: 'bg-rose-500',
  },
  tech: {
    label: 'Tech',
    icon: Cpu,
    accent: 'text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-100 dark:bg-sky-500/10',
    bar: 'bg-sky-500',
  },
};

const ORDER: Bucket[] = ['cyber', 'ai', 'tech'];

function formatVolume(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatEndDate(iso: string | null): string {
  if (!iso) return 'open-ended';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'open-ended';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function MarketCard({ m }: { m: PredictionMarket }): JSX.Element {
  const meta = BUCKET_META[m.bucket];
  const top = m.outcomes[0];
  const pct = Math.round(m.probability * 100);
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block surface-card/60 p-5 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${meta.accent}`}
        >
          <meta.icon size={11} /> {meta.label}
        </span>
        <ExternalLink
          size={13}
          className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
        />
      </div>
      <p
        className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug mb-4 line-clamp-3"
        title={m.question}
      >
        {m.question}
      </p>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-mono text-slate-500 dark:text-slate-400">{top ? `${top.name} ${pct}%` : `${pct}%`}</span>
        <span className="font-mono text-slate-400 dark:text-slate-500">{formatVolume(m.volume)} vol</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
        <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
      <div className="mt-3 text-[11px] font-mono text-slate-400 dark:text-slate-500">
        resolves {formatEndDate(m.end_date)}
      </div>
    </a>
  );
}

export default function Predictions(): JSX.Element {
  const [data, setData] = useState<PredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Bucket>('all');

  const loadRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    loadRef.current?.abort();
    const ctrl = new AbortController();
    loadRef.current = ctrl;
    setLoading(true);
    setError(null);
    fetch('/api/v1/predictions', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: PredictionsResponse | undefined) => {
        if (!ctrl.signal.aborted && d) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) {
          setError(String(e));
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      loadRef.current?.abort();
    };
  }, [load]);

  const visibleBuckets = ORDER.filter((b) => filter === 'all' || filter === b);
  const total = data?.total ?? 0;

  const headerExtra = data ? (
    <div className="flex flex-wrap gap-2">
      {(['all', ...ORDER] as const).map((b) => {
        const count = b === 'all' ? total : (data.buckets[b]?.length ?? 0);
        const active = filter === b;
        return (
          <button
            key={b}
            type="button"
            onClick={() => setFilter(b)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-colors ${
              active
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400 dark:hover:border-slate-600'
            }`}
          >
            {b === 'all' ? 'All' : BUCKET_META[b].label} ({count})
          </button>
        );
      })}
    </div>
  ) : undefined;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<TrendingUp className="w-7 h-7" />}
      title="Prediction Markets"
      description="Live Manifold prediction-market odds on cyber-threat, tech, and AI outcomes — ranked by liquidity. Community crowd forecasts, not advice. Source: Manifold Markets."
      headerExtra={headerExtra}
      loading={loading}
      error={error ? `Failed to load predictions: ${error}` : null}
      onRetry={load}
      empty={!loading && !error && total === 0}
      emptyMessage="No matching prediction markets right now."
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-10">
        {visibleBuckets.map((bucket) => {
          const markets = data?.buckets[bucket] ?? [];
          if (markets.length === 0) return null;
          const meta = BUCKET_META[bucket];
          return (
            <section key={bucket}>
              <h2 className="flex items-center gap-2 text-sm font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
                <meta.icon size={14} className={meta.accent.split(' ')[0]} /> {meta.label}
                <span className="text-slate-400 dark:text-slate-400">· {markets.length}</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {markets.map((m) => (
                  <MarketCard key={m.slug} m={m} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
