import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Users, ExternalLink } from 'lucide-react';

interface PlatformResult {
  platform: string;
  name: string;
  category: string;
  status: 'found' | 'not-found' | 'unknown' | 'error';
  url: string;
}

interface OsnitResponse {
  username: string;
  generated_at: string;
  total_checked: number;
  found: number;
  results: PlatformResult[];
  summary: Record<string, number>;
}

const CATEGORY_COLORS: Record<string, string> = {
  social: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  dev: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  tech: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  gaming: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  creative: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  finance: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  other: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

export default function UsernameOsnit(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('username') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OsnitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'found'>('all');

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const username = input.trim();
    if (!username || username.length < 2) {
      setError('Username must be 2+ chars');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/v1/username-osint?username=${encodeURIComponent(username)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const filtered = result?.results.filter((r) => filter === 'all' || r.status === 'found') ?? [];
  const found = filtered.filter((r) => r.status === 'found');
  const notFound = filtered.filter((r) => r.status === 'not-found');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <BackLink to="/dfir">
          <ArrowLeft size={14} /> Back to DFIR
        </BackLink>
        <h1 className="text-2xl font-bold mt-4 flex items-center gap-2">
          <Users className="text-pink-500" /> Username OSINT
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Check 240+ platforms for a username — social, dev, gaming, creative, finance, crypto
        </p>

        <form onSubmit={handleSearch} className="mt-6 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter username (e.g. elonmusk)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Search size={14} /> {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-400">
                Checked <span className="font-bold text-slate-200">{result.total_checked}</span> platforms · Found on{' '}
                <span className="font-bold text-emerald-400">{result.found}</span>
              </div>
              <div className="flex gap-1 ml-auto">
                {(['all', 'found'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 text-xs rounded ${filter === f ? 'bg-pink-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                  >
                    {f === 'all' ? 'All' : 'Found Only'}
                  </button>
                ))}
              </div>
            </div>

            {result.found > 0 && (
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="text-sm font-semibold mb-3 text-emerald-400">Found ({found.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {found.map((r) => (
                    <a
                      key={r.platform}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 transition text-sm"
                    >
                      <span className="text-emerald-400">✓</span>
                      <span className="font-medium">{r.name}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS.other}`}
                      >
                        {r.category}
                      </span>
                      <ExternalLink size={10} className="text-slate-500 ml-auto" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {filter === 'all' && notFound.length > 0 && (
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="text-sm font-semibold mb-3 text-slate-400">Not Found ({notFound.length})</h3>
                <div className="flex flex-wrap gap-1.5">
                  {notFound.map((r) => (
                    <span
                      key={r.platform}
                      className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(result.summary).length > 0 && (
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="text-sm font-semibold mb-2 text-slate-400">Category Breakdown</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(result.summary)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <span
                        key={cat}
                        className={`text-xs px-2 py-1 rounded border ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other}`}
                      >
                        {cat}: {count}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
