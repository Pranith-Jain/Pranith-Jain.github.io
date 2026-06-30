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
  MISSILE: { icon: '🚀', color: 'text-red-400' },
  INTERCEPTION: { icon: '🛡', color: 'text-emerald-400' },
  DRONE: { icon: '✈', color: 'text-amber-400' },
  AIRSTRIKE: { icon: '💥', color: 'text-red-400' },
  ROCKET: { icon: '🎯', color: 'text-orange-400' },
  STRIKE: { icon: '⚡', color: 'text-amber-400' },
  REPORT: { icon: '📡', color: 'text-blue-400' },
};
const SEV_COLORS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

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
      /* */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStrikes();
    const id = setInterval(fetchStrikes, 120000);
    return () => clearInterval(id);
  }, [fetchStrikes]);

  const counts = strikes.reduce(
    (acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-red-400" />
          <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">MISSILE / STRIKE TRACKER</h3>
        </div>
        <span className="text-mini font-mono text-slate-400">{strikes.length} events</span>
      </div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(counts).map(([cat, count]) => {
          const c = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.REPORT;
          return (
            <span key={cat} className="text-mini flex items-center gap-1">
              <span>{c.icon}</span>
              <span className={`font-bold ${c.color}`}>{cat}</span>
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
          <div className="text-center text-tool text-slate-400 py-4">No strike events detected</div>
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
                  <span className={`text-mini font-bold px-1.5 py-0.5 rounded ${c.color} bg-current/10`}>
                    {s.category}
                  </span>
                  <span className={`text-mini font-bold ${SEV_COLORS[s.severity]}`}>{s.severity.toUpperCase()}</span>
                  <span className="text-mini text-slate-400 ml-auto">{timeAgo(s.date)}</span>
                </div>
                <p className="text-tool text-slate-700 dark:text-slate-200 leading-tight line-clamp-1">{s.title}</p>
                <span className="text-mini text-slate-400">
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
