import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, ArrowRight } from 'lucide-react';
import { preloadRoute } from '../../lib/route-preloaders';

interface PulseEvent {
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface GlobalPulseResponse {
  generated_at: string;
  total_events: number;
  events: PulseEvent[];
  layers: Record<string, number>;
}

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

export function GlobalPulseCard(): JSX.Element | null {
  const [data, setData] = useState<GlobalPulseResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    fetch('/api/v1/global-pulse', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<GlobalPulseResponse>) : Promise.reject(new Error(String(r.status)))))
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

  const { critical, topLayers } = useMemo(() => {
    if (!data) return { critical: 0, topLayers: [] };
    const critical = data.events.filter((e) => e.severity === 'critical').length;
    const layerEntries = Object.entries(data.layers).filter(([, count]) => count > 0);
    const topLayers = layerEntries.sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { critical, topLayers };
  }, [data]);

  if (failed) return null;
  if (!data) return null;

  return (
    <Link
      to="/threatintel/predictive/global-pulse"
      onMouseEnter={() => preloadRoute('/threatintel/predictive/global-pulse')}
      onFocus={() => preloadRoute('/threatintel/predictive/global-pulse')}
      className="group mb-6 flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-brand-400 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:hover:border-brand-500"
    >
      <Globe className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-mini font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
            Global Pulse
          </span>
          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {fmt(data.total_events)} events · {fmt(critical)} critical
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {topLayers.map(([kind, count]) => `${kind.replace(/_/g, ' ')} (${fmt(count)})`).join(' · ')}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-400" />
    </Link>
  );
}
