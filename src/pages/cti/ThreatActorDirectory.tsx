import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Users } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Actor {
  name: string;
  aliases: string[];
  country: string;
  motivation: string;
  description: string;
  malware: string[];
  techniques: string[];
  lastActive: string;
  source: string;
}

const MOTIVATION_PILL: Record<string, string> = {
  espionage: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  financial: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hacktivism: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  destruction: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export default function ThreatActorDirectory() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [motivationFilter, setMotivationFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/threat-intel/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.actors?.items) setActors(data.actors.items);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    let items = actors;
    if (motivationFilter !== 'all') items = items.filter((a) => a.motivation?.toLowerCase() === motivationFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.aliases?.some((al) => al.toLowerCase().includes(q)) ||
          a.country?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [actors, motivationFilter, search]);

  return (
    <>
      <PageMeta
        title="Threat Actors"
        description="APT groups, malware families, and ransomware operators."
        canonicalPath="/cti/threats"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
              >
                <ArrowLeft size={16} className="text-slate-600 dark:text-slate-400" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Threat Actors</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {filtered.length.toLocaleString()} entities tracked
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actors, aliases, countries..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {['all', 'espionage', 'financial', 'hacktivism', 'destruction'].map((m) => (
              <button
                key={m}
                onClick={() => setMotivationFilter(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${motivationFilter === m ? 'bg-brand-50 dark:bg-brand-950/30 border-brand-300 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}
              >
                {m === 'all' ? 'All' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((actor) => (
                <div
                  key={actor.name}
                  className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{actor.name}</h3>
                    {actor.motivation && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${MOTIVATION_PILL[actor.motivation.toLowerCase()] || 'border-slate-300 text-slate-500'}`}
                      >
                        {actor.motivation}
                      </span>
                    )}
                  </div>
                  {actor.country && <p className="text-xs text-slate-500 mb-2">{actor.country}</p>}
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{actor.description}</p>
                  {actor.malware && actor.malware.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {actor.malware.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 rounded"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
