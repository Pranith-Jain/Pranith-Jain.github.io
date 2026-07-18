import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Coins, Fuel } from 'lucide-react';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  error?: boolean;
}

function fmtPrice(p: number): string {
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DefenseMarkets() {
  const [defense, setDefense] = useState<MarketItem[]>([]);
  const [indices, setIndices] = useState<MarketItem[]>([]);
  const [crypto, setCrypto] = useState<MarketItem[]>([]);
  const [oil, setOil] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [marketsRes, cryptoRes] = await Promise.allSettled([
        fetch('/api/v1/ironsight/markets', { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : [])),
        fetch('/api/v1/ironsight/crypto', { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : [])),
      ]);
      const allMarkets: MarketItem[] = marketsRes.status === 'fulfilled' ? marketsRes.value : [];
      const allCrypto: MarketItem[] = cryptoRes.status === 'fulfilled' ? cryptoRes.value : [];
      const idxSyms = ['^GSPC', '^DJI', '^VIX', 'GC=F', 'DX-Y.NYB'];
      const defSyms = ['LMT', 'RTX', 'NOC', 'BA', 'GD', 'LHX'];
      const oilSyms = ['CL=F', 'BZ=F', 'NG=F'];
      setIndices(allMarkets.filter((m) => idxSyms.includes(m.symbol)));
      setDefense(allMarkets.filter((m) => defSyms.includes(m.symbol)));
      setOil(allMarkets.filter((m) => oilSyms.includes(m.symbol)));
      setCrypto(allCrypto);
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 300000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const renderRows = (items: MarketItem[]) =>
    items.map((m, i) => (
      <div
        key={i}
        className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="text-tool text-slate-700 dark:text-slate-200">{m.name}</span>
        <div className="flex items-center gap-3">
          <span className="text-tool font-bold text-slate-800 dark:text-white">
            {m.error ? 'N/A' : `$${fmtPrice(m.price)}`}
          </span>
          {!m.error && (
            <span className={`text-mini w-14 text-right ${m.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {m.changePercent >= 0 ? '+' : ''}
              {m.changePercent.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    ));

  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-cyan-400" />
        <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">DEFENSE & MARKETS</h3>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-mini font-mono text-cyan-400 tracking-wider mb-1 px-2">INDICES</div>
            {renderRows(indices)}
          </div>
          <div>
            <div className="text-mini font-mono text-cyan-400 tracking-wider mb-1 px-2">DEFENSE CONTRACTORS</div>
            {renderRows(defense)}
          </div>
          <div>
            <div className="flex items-center gap-1 text-mini font-mono text-cyan-400 tracking-wider mb-1 px-2">
              <Coins size={10} /> CRYPTO
            </div>
            {renderRows(crypto)}
          </div>
          <div>
            <div className="flex items-center gap-1 text-mini font-mono text-cyan-400 tracking-wider mb-1 px-2">
              <Fuel size={10} /> ENERGY
            </div>
            {renderRows(oil)}
          </div>
        </div>
      )}
    </div>
  );
}
