import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { preloadRoute } from '../lib/route-preloaders';

interface FeedStatusResponse {
  overall: 'ok' | 'degraded' | 'down' | 'cold';
  total_sources: number;
  healthy: number;
  degraded: number;
  down: number;
  cold: number;
}

const OVERALL_META: Record<string, { label: string; dot: string; bg: string }> = {
  ok: { label: 'All feeds healthy', dot: 'bg-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  degraded: { label: 'Some feeds degraded', dot: 'bg-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
  down: { label: 'Feeds unreachable', dot: 'bg-rose-500', bg: 'bg-rose-500/10 border-rose-500/20' },
  cold: {
    label: 'Feeds warming up',
    dot: 'bg-slate-400',
    bg: 'bg-slate-100 dark:bg-[rgb(var(--surface-300))] border-slate-200 dark:border-[rgb(var(--border-400))]',
  },
};

export function FeedHealthBadge(): JSX.Element | null {
  const [data, setData] = useState<FeedStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    fetch('/api/v1/feed-status', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<FeedStatusResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  if (failed || !data) return null;

  const meta = OVERALL_META[data.overall]!;

  return (
    <Link
      to="/threatintel/catalog?cat=tools"
      onMouseEnter={() => preloadRoute('/threatintel/catalog?cat=tools')}
      onFocus={() => preloadRoute('/threatintel/catalog?cat=tools')}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-mini font-mono transition-colors hover:opacity-80 ${meta.bg}`}
    >
      <span className={`relative flex h-2 w-2 ${data.overall === 'ok' ? 'animate-pulse' : ''}`}>
        <span className={`absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-75`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
      </span>
      <span className="text-slate-700 dark:text-slate-300">
        {data.healthy}/{data.total_sources} feeds
      </span>
      <Activity size={11} className="text-slate-400" aria-hidden="true" />
    </Link>
  );
}
