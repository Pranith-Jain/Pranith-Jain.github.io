import { lazy, Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, MapPin, Loader2, Building2, Globe } from 'lucide-react';

const InfraMap = lazy(() => import('../../components/threatintel/InfraMap'));

interface InfraResult {
  id: string;
  type: string;
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  category: string;
}

interface InfraSearchResponse {
  query: string;
  parsed: { types: string[]; region: string; country: string; near: string };
  bbox: [number, number, number, number] | null;
  total: number;
  results: InfraResult[];
  generated_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Energy & Power': '#f59e0b',
  Telecom: '#3b82f6',
  'Oil & Gas': '#78716c',
  Water: '#06b6d4',
  Aviation: '#8b5cf6',
  Maritime: '#0ea5e9',
  'Rail & Transit': '#6366f1',
  Structures: '#64748b',
  Industrial: '#78716c',
  Military: '#ef4444',
  Government: '#10b981',
  Healthcare: '#ec4899',
  Education: '#f97316',
  Culture: '#a855f7',
  Tourism: '#14b8a6',
  Religious: '#eab308',
  Historic: '#a3a3a3',
  Agriculture: '#22c55e',
  Services: '#6366f1',
  Emergency: '#dc2626',
  'Cable Transport': '#0ea5e9',
  Monitoring: '#64748b',
  Community: '#10b981',
};

export default function InfraSearch(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InfraSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState('All');
  const [mapGlobal, setMapGlobal] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setSearchParams({ q }, { replace: true });
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/v1/infra-search?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'search failed');
    } finally {
      setLoading(false);
    }
  };

  const filtered = result?.results.filter((r) => catFilter === 'All' || r.category === catFilter) ?? [];
  const categoryCounts: Record<string, number> = {};
  for (const r of result?.results ?? []) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Building2 size={28} className="text-brand-600 dark:text-brand-400" /> Infrastructure Search
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          Map real-world infrastructure from OpenStreetMap data — 200+ types across 30+ categories.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Powered by Overpass API + Nominatim. Inspired by Sightline (MIT). Try: "telecom towers in india", "military
          bases in europe", "power plants near tokyo"
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
        <form onSubmit={onSubmit} className="flex gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="telecom towers in india"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
              aria-label="Infrastructure search query"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" />
            Search
          </button>
        </form>
      </section>

      {loading && (
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mb-4 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Querying OpenStreetMap…
        </p>
      )}
      {error && (
        <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4 inline-flex items-center gap-2">
          error: {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center gap-4 font-mono text-sm text-slate-500">
            <span>
              Found <span className="text-slate-900 dark:text-slate-100 font-bold">{result.total}</span> results
            </span>
            {result.parsed.types.length > 0 && (
              <span>
                Types: <span className="text-slate-900 dark:text-slate-100">{result.parsed.types.join(', ')}</span>
              </span>
            )}
            {result.parsed.country && (
              <span>
                Country: <span className="text-slate-900 dark:text-slate-100">{result.parsed.country}</span>
              </span>
            )}
          </div>

          {/* Map */}
          {result.results.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-mono text-slate-500">
                  {mapGlobal ? 'Global view' : 'Zoomed to results'}
                </span>
                <button
                  onClick={() => setMapGlobal(!mapGlobal)}
                  className="text-xs font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                >
                  <Globe size={12} /> {mapGlobal ? 'Zoom to results' : 'Global view'}
                </button>
              </div>
              <div style={{ height: 500 }}>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm">
                      <Loader2 className="animate-spin mr-2" /> Loading map…
                    </div>
                  }
                >
                  <InfraMap results={filtered} bbox={result.bbox} global={mapGlobal} />
                </Suspense>
              </div>
            </section>
          )}

          {/* Category filter */}
          {Object.keys(categoryCounts).length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {['All', ...Object.keys(categoryCounts).sort()].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={`text-xs font-mono px-2 py-0.5 rounded-lg border transition ${
                    catFilter === cat
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {cat === 'All' ? `All (${result.results.length})` : `${cat} (${categoryCounts[cat]})`}
                </button>
              ))}
            </div>
          )}

          {/* Results list */}
          {filtered.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="max-h-96 overflow-y-auto space-y-1">
                {filtered.slice(0, 100).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition text-sm"
                  >
                    <MapPin size={14} style={{ color: CATEGORY_COLORS[r.category] ?? '#6366f1' }} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{r.name}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
                      </span>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {r.category}
                    </span>
                  </div>
                ))}
              </div>
              {filtered.length > 100 && (
                <p className="text-xs text-slate-400 font-mono mt-2">Showing 100 of {filtered.length} results</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
