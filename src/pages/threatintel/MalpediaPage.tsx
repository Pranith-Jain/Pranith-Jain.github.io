import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Search, Users, Bug } from 'lucide-react';

interface MalpediaResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  families?: Record<string, unknown>[];
  actors?: Record<string, unknown>[];
}

export default function MalpediaPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'actor' | 'family' | 'search'>('search');
  const [result, setResult] = useState<MalpediaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const endpoint =
      mode === 'search'
        ? `/api/v1/malpedia/search?q=${encodeURIComponent(query.trim())}`
        : `/api/v1/malpedia/${mode}?q=${encodeURIComponent(query.trim())}`;

    try {
      const res = await fetch(endpoint);
      const data: MalpediaResult = await res.json();
      if (data.ok) setResult(data);
      else setError(data.error ?? 'not found');
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Bug size={28} className="text-brand-600 dark:text-brand-400" /> Malpedia
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
          Malware family attribution lookup powered by{' '}
          <a
            href="https://malpedia.caad.fkie.fraunhofer.de/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Fraunhofer FKIE Malpedia
          </a>{' '}
          — search actors and malware families for descriptions, associated malware, and references.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-6">
        <div className="flex gap-3 mb-4">
          {(['search', 'actor', 'family'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                mode === m
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {m === 'search' ? 'Search all' : m === 'actor' ? 'Actor lookup' : 'Family lookup'}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder={
              mode === 'actor'
                ? 'Actor name (e.g. lazarus, apt28)'
                : mode === 'family'
                  ? 'Family name (e.g. cobalt strike, redline)'
                  : 'Search actors and families…'
            }
            className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="button"
            onClick={search}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={15} className="inline mr-1.5" />
            {loading ? '…' : 'Lookup'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 font-mono text-sm text-amber-700 dark:text-amber-300 mb-6">
          {error}
        </div>
      )}

      {/* Search results */}
      {result && mode === 'search' && (
        <div className="space-y-6">
          {result.actors && result.actors.length > 0 && (
            <section>
              <h2 className="font-display font-semibold text-base mb-3 inline-flex items-center gap-2">
                <Users size={16} className="text-brand-600" /> Actors ({result.actors.length})
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.actors.map((a, i) => {
                  const desc = typeof a.description === 'string' ? a.description : '';
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                    >
                      <div className="font-display font-semibold text-sm">{String(a.actor_name ?? a.name ?? '?')}</div>
                      {desc && (
                        <p className="text-[11px] font-mono text-slate-500 mt-1 line-clamp-2">{desc.slice(0, 200)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {result.families && result.families.length > 0 && (
            <section>
              <h2 className="font-display font-semibold text-base mb-3 inline-flex items-center gap-2">
                <Bug size={16} className="text-brand-600" /> Families ({result.families.length})
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.families.map((f, i) => {
                  const desc = typeof f.description === 'string' ? f.description : '';
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                    >
                      <div className="font-display font-semibold text-sm">
                        {String(f.family_name ?? f.common_name ?? '?')}
                      </div>
                      {String(f.common_name) && String(f.common_name) !== String(f.family_name) && (
                        <p className="text-[11px] font-mono text-slate-500">aka {String(f.common_name)}</p>
                      )}
                      {desc && (
                        <p className="text-[11px] font-mono text-slate-500 mt-1 line-clamp-2">{desc.slice(0, 200)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {(!result.actors || result.actors.length === 0) && (!result.families || result.families.length === 0) && (
            <p className="font-mono text-sm text-slate-500">No results found.</p>
          )}
        </div>
      )}

      {/* Actor / Family detail */}
      {result && mode !== 'search' && result.data && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center gap-3 mb-4">
            {mode === 'actor' ? (
              <Users size={20} className="text-brand-600" />
            ) : (
              <Bug size={20} className="text-brand-600" />
            )}
            <div>
              <h2 className="font-display font-bold text-xl">
                {String(
                  result.data.actor_name ?? result.data.family_name ?? result.data.common_name ?? 'Malpedia Entry'
                )}
              </h2>
              {typeof result.data.common_name === 'string' &&
                result.data.common_name !== String(result.data.family_name) && (
                  <p className="text-xs font-mono text-slate-500">aka {result.data.common_name}</p>
                )}
            </div>
          </div>

          {typeof result.data.description === 'string' && (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">{result.data.description}</p>
          )}

          {Array.isArray(result.data.associated_actors) && result.data.associated_actors.length > 0 && (
            <div className="mb-3">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                Associated actors
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(result.data.associated_actors as string[]).map((a: string) => (
                  <span
                    key={a}
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(result.data.references) && result.data.references.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">References</h3>
              <ul className="space-y-1">
                {(result.data.references as string[]).slice(0, 20).map((ref: string, i: number) => (
                  <li key={i}>
                    <a
                      href={ref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      {ref} <ExternalLink size={10} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
