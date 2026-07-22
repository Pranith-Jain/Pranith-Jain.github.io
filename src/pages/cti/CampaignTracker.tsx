import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Radio, RefreshCw, Search, Users } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Campaign {
  name: string;
  type: 'ransomware' | 'apt' | 'operation';
  status: 'active' | 'inactive';
  country?: string;
  motivation: string;
  victims: number;
  sectors: string[];
  startDate: string;
  lastActivity: string;
  description: string;
}

const TYPE_PILL: Record<string, string> = {
  ransomware: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  apt: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  operation: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

export default function CampaignTracker() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/data/threat-intel/index.json');
      if (res.ok) {
        const data = await res.json();
        if (data.iocIndex) {
          const campaignData = data.iocIndex
            .filter((i: Record<string, unknown>) => i.type === 'campaign')
            .map((c: Record<string, unknown>) => ({
              name: (c.value as string) || '',
              type: 'ransomware' as const,
              status: 'active' as const,
              country: '',
              motivation: 'financial',
              victims: 0,
              sectors: [],
              startDate: (c.observed_at as string) || '',
              lastActivity: (c.observed_at as string) || '',
              description: (c.context as string) || '',
            }));
          setCampaigns(campaignData);
        }
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
    let items = campaigns;
    if (typeFilter !== 'all') items = items.filter((c) => c.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
    }
    return items.sort((a, b) => b.victims - a.victims);
  }, [campaigns, typeFilter, search]);

  return (
    <>
      <PageMeta
        title="Active Campaigns"
        description="Live ransomware and APT operations tracked in real-time."
        canonicalPath="/cti/campaigns"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center">
                <Radio size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Active Campaigns</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {filtered.length.toLocaleString()} campaigns tracked
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {['all', 'ransomware', 'apt', 'operation'].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${typeFilter === t ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{c.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${TYPE_PILL[c.type] || ''}`}>
                          {c.type}
                        </span>
                        {c.status === 'active' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-700">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{c.description}</p>
                      <div className="flex items-center gap-4 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Users size={10} /> {c.victims} victims
                        </span>
                        {c.country && <span>{c.country}</span>}
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {c.lastActivity || c.startDate}
                        </span>
                      </div>
                    </div>
                  </div>
                  {c.sectors && c.sectors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.sectors.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 rounded"
                        >
                          {s}
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
