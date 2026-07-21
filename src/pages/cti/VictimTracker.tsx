import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Search, Skull } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Victim {
  name: string;
  group: string;
  country: string;
  sector: string;
  date: string;
  url?: string;
  description?: string;
}

export default function VictimTracker() {
  const [victims, setVictims] = useState<Victim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/threat-intel/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.victims?.items) setVictims(data.victims.items);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groups = useMemo(() => {
    const s = new Set(victims.map((v) => v.group).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [victims]);

  const filtered = useMemo(() => {
    let items = victims;
    if (groupFilter !== 'all') items = items.filter((v) => v.group === groupFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.group?.toLowerCase().includes(q) ||
          v.country?.toLowerCase().includes(q) ||
          v.sector?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [victims, groupFilter, search]);

  return (
    <>
      <PageMeta
        title="Ransomware Victims"
        description="Confirmed ransomware attack victims from leak sites."
        canonicalPath="/cti/victims"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center">
                <Skull size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Ransomware Victims</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {filtered.length.toLocaleString()} confirmed victims
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search victims, groups, countries, sectors..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
            >
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g === 'all' ? 'All Groups' : g}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : (
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <th className="px-4 py-2.5 font-semibold">Victim</th>
                    <th className="px-4 py-2.5 font-semibold">Group</th>
                    <th className="px-4 py-2.5 font-semibold">Country</th>
                    <th className="px-4 py-2.5 font-semibold">Sector</th>
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold">Leak</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((v, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{v.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] rounded">
                          {v.group}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{v.country || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{v.sector || '—'}</td>
                      <td className="px-4 py-2.5 text-[11px] font-mono text-slate-400">{v.date || '—'}</td>
                      <td className="px-4 py-2.5">
                        {v.url && (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 hover:underline flex items-center gap-1 text-xs"
                          >
                            Leak <ExternalLink size={10} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
