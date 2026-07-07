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
      if (res.ok) setMarkets((await res.json()).markets || []);
    } catch {
      /* */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMarkets();
    const id = setInterval(fetchMarkets, 600000);
    return () => clearInterval(id);
  }, [fetchMarkets]);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-emerald-400" />
          <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">PREDICTION MARKETS</h3>
        </div>
        <span className="text-mini font-mono text-slate-400">{markets.length} markets · Polymarket</span>
      </div>
      <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : markets.length === 0 ? (
          <div className="text-center text-tool text-slate-400 py-4">No prediction markets found</div>
        ) : (
          markets.map((m) => {
            const yes = m.outcomes.find((o) => o.label === 'Yes') || m.outcomes[0];
            const price = yes?.price ?? 0;
            const change = m.oneDayPriceChange ? (m.oneDayPriceChange * 100).toFixed(1) : null;
            return (
              <div
                key={m.id}
                className="py-2 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-tool text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">
                      {m.question}
                    </div>
                    <div className="text-mini text-slate-400 mt-0.5">
                      Vol: {formatVol(m.volume24hr)} 24h · {formatVol(m.volumeTotal)} total
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-bold ${price >= 70 ? 'text-emerald-400' : price >= 40 ? 'text-amber-400' : 'text-red-400'}`}
                    >
                      {price}%
                    </div>
                    {change && (
                      <div className={`text-mini ${parseFloat(change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(change) >= 0 ? '+' : ''}
                        {change}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 h-1.5 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded transition-all duration-500 ${price >= 70 ? 'bg-emerald-400' : price >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.max(price, 2)}%`, opacity: 0.8 }}
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
