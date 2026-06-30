import { useState, useEffect, useCallback } from 'react';
import { Flame } from 'lucide-react';

interface StrikeEvent {
  id: string;
  date: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  source: string;
  url: string;
  country: string;
}

const CATEGORY_CONFIG: Record<string, { icon: string; color: string }> = {
  MISSILE: { icon: '🚀', color: '#ef4444' },
  INTERCEPTION: { icon: '🛡', color: '#22c55e' },
  DRONE: { icon: '✈', color: '#f59e0b' },
  AIRSTRIKE: { icon: '💥', color: '#ef4444' },
  ROCKET: { icon: '🎯', color: '#f97316' },
  STRIKE: { icon: '⚡', color: '#f59e0b' },
  REPORT: { icon: '📡', color: '#3b82f6' },
};

const SEV_COLORS: Record<string, string> = { low: '#94a3b8', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`;
  return `${Math.floor(abs / 86400)}d ago`;
}

export default function StrikeTracker() {
  const [strikes, setStrikes] = useState<StrikeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStrikes = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/strikes', { signal: AbortSignal.timeout(20000) });
      if (res.ok) setStrikes(await res.json());
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStrikes();
    const id = setInterval(fetchStrikes, 120000);
    return () => clearInterval(id);
  }, [fetchStrikes]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-red-400" />
          <h3 className="text-sm font-bold font-mono text-slate-700 dark:text-slate-200">MISSILE / STRIKE TRACKER</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">{strikes.length} events</span>
      </div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(
          strikes.reduce(
            (acc, s) => {
              acc[s.category] = (acc[s.category] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
        ).map(([cat, count]) => {
          const c = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.REPORT;
          return (
            <span key={cat} className="text-[10px] flex items-center gap-1">
              <span>{c.icon}</span>
              <span className="font-bold" style={{ color: c.color }}>
                {cat}
              </span>
              <span className="text-slate-400">({count})</span>
            </span>
          );
        })}
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : strikes.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-4">No strike events detected</div>
        ) : (
          strikes.slice(0, 12).map((s, i) => {
            const c = CATEGORY_CONFIG[s.category] || CATEGORY_CONFIG.REPORT;
            return (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: c.color, backgroundColor: `${c.color}15`, border: `1px solid ${c.color}30` }}
                  >
                    {s.category}
                  </span>
                  <span className="text-[9px] font-bold" style={{ color: SEV_COLORS[s.severity] }}>
                    {s.severity.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(s.date)}</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-tight line-clamp-1">{s.title}</p>
                <span className="text-[9px] text-slate-400">
                  {s.source} · {s.country}
                </span>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
