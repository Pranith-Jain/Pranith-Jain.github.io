import { useState, useEffect, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';

interface Market {
  id: string;
  question: string;
  slug: string;
  outcomes: { label: string; price: number }[];
  volume24hr: number;
  volumeTotal: number;
  oneDayPriceChange: number;
}

function formatVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function PredictionMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/polymarket', { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        setMarkets(data.markets || []);
      }
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMarkets();
    const id = setInterval(fetchMarkets, 600000);
    return () => clearInterval(id);
  }, [fetchMarkets]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-emerald-400" />
          <h3 className="text-sm font-bold font-mono text-slate-700 dark:text-slate-200">PREDICTION MARKETS</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">{markets.length} markets · Polymarket</span>
      </div>
      <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : markets.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-4">No prediction markets found</div>
        ) : (
          markets.map((m) => {
            const yes = m.outcomes.find((o) => o.label === 'Yes') || m.outcomes[0];
            const price = yes?.price ?? 0;
            const change = m.oneDayPriceChange ? (m.oneDayPriceChange * 100).toFixed(1) : null;
            return (
              <div
                key={m.id}
                className="py-2 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">
                      {m.question}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      Vol: {formatVol(m.volume24hr)} 24h · {formatVol(m.volumeTotal)} total
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-sm font-bold"
                      style={{ color: price >= 70 ? '#22c55e' : price >= 40 ? '#f59e0b' : '#ef4444' }}
                    >
                      {price}%
                    </div>
                    {change && (
                      <div className={`text-[9px] ${parseFloat(change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(change) >= 0 ? '+' : ''}
                        {change}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 h-1.5 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${Math.max(price, 2)}%`,
                      background: price >= 70 ? '#22c55e' : price >= 40 ? '#f59e0b' : '#ef4444',
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
