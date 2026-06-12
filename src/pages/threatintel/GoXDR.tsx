import { useEffect, useMemo, useState } from 'react';
import { Search, Check, Shield, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataState } from '../../components/DataState';

interface GoXDRQuery {
  id: number;
  name: string;
  cat: string;
  sub: string;
  plat: 'both' | 'sentinel' | 'xdr';
  tables: string[];
  tags: string[];
  sev: 'critical' | 'high' | 'medium' | 'low';
  desc: string;
  kql: string;
  added: string;
}

const SEV_CONFIG: Record<string, { bg: string; text: string; border: string; icon: typeof Shield }> = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-300 dark:border-red-700',
    icon: AlertTriangle,
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-300 dark:border-orange-700',
    icon: AlertTriangle,
  },
  medium: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-300 dark:border-amber-700',
    icon: Info,
  },
  low: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-300 dark:border-blue-700',
    icon: Info,
  },
};

const PLAT_LABEL: Record<string, string> = { both: 'Sentinel + XDR', sentinel: 'Sentinel', xdr: 'Defender XDR' };
const PLAT_COLOR: Record<string, string> = {
  both: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  sentinel: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  xdr: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
};

export default function GoXDR(): JSX.Element {
  const [queries, setQueries] = useState<GoXDRQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [sevFilter, setSevFilter] = useState('all');
  const [platFilter, setPlatFilter] = useState('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://goxdr.fyi/queries.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: GoXDRQuery[]) => {
        setQueries(d);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(queries.map((q) => q.cat))).sort()], [queries]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return queries.filter((q) => {
      if (catFilter !== 'All' && q.cat !== catFilter) return false;
      if (sevFilter !== 'all' && q.sev !== sevFilter) return false;
      if (platFilter === 'sentinel' && q.plat === 'xdr') return false;
      if (platFilter === 'xdr' && q.plat === 'sentinel') return false;
      if (!s) return true;
      return (
        q.name.toLowerCase().includes(s) ||
        q.desc.toLowerCase().includes(s) ||
        q.tags.some((t) => t.includes(s)) ||
        q.tables.some((t) => t.toLowerCase().includes(s)) ||
        q.sub.toLowerCase().includes(s)
      );
    });
  }, [search, catFilter, sevFilter, platFilter, queries]);

  const stats = useMemo(() => {
    const f = filtered;
    return {
      total: f.length,
      critical: f.filter((q) => q.sev === 'critical').length,
      high: f.filter((q) => q.sev === 'high').length,
      medium: f.filter((q) => q.sev === 'medium').length,
      low: f.filter((q) => q.sev === 'low').length,
    };
  }, [filtered]);

  const copyKQL = (id: number, kql: string) => {
    navigator.clipboard.writeText(kql).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toggleOpen = (id: number) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={20} />}
      title="GoXDR KQL Library"
      description="Curated KQL detection queries for Microsoft Sentinel + Defender XDR"
    >
      <DataState loading={loading} error={error} rows={queries.length} emptyLabel="No queries loaded from GoXDR.">
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            {[
              { label: 'Total', value: stats.total, color: 'text-brand-600 dark:text-brand-400' },
              { label: 'Critical', value: stats.critical, color: 'text-red-600 dark:text-red-400' },
              { label: 'High', value: stats.high, color: 'text-orange-600 dark:text-orange-400' },
              { label: 'Medium', value: stats.medium, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Low', value: stats.low, color: 'text-blue-600 dark:text-blue-400' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center"
              >
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search queries — identity, aitm, password spray, ntlm, bloodhound, oauth..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpenId(null);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex flex-wrap gap-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    catFilter === c
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-brand-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <div className="flex gap-1">
              {(['critical', 'high', 'medium', 'low'] as const).map((s) => {
                const cfg = SEV_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setSevFilter(sevFilter === s ? 'all' : s)}
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase border transition-colors ${
                      sevFilter === s
                        ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                        : 'bg-transparent text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <div className="flex gap-1">
              {(['all', 'sentinel', 'xdr'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatFilter(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    platFilter === p
                      ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200'
                      : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {p === 'all' ? 'All' : PLAT_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Query list */}
          <div className="space-y-2">
            {filtered.map((q) => {
              const isOpen = openId === q.id;
              const sv = SEV_CONFIG[q.sev];
              const SevIcon = sv.icon;
              return (
                <div
                  key={q.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <button
                    onClick={() => toggleOpen(q.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <SevIcon size={14} className={sv.text} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{q.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sv.bg} ${sv.text} ${sv.border}`}
                        >
                          {q.sev}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PLAT_COLOR[q.plat]}`}>
                          {PLAT_LABEL[q.plat]}
                        </span>
                      </div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {q.tables.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          >
                            {t}
                          </span>
                        ))}
                        {q.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 text-slate-500"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp size={14} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={14} className="text-slate-400" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 mb-3 leading-relaxed">{q.desc}</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {q.tags.map((t) => (
                          <span
                            key={t}
                            className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => copyKQL(q.id, q.kql)}
                          className={`absolute top-2 right-2 px-3 py-1 rounded text-xs font-semibold z-10 transition-colors ${
                            copiedId === q.id
                              ? 'bg-green-800 text-green-200'
                              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                          }`}
                        >
                          {copiedId === q.id ? (
                            <span className="flex items-center gap-1">
                              <Check size={12} /> Copied
                            </span>
                          ) : (
                            'Copy KQL'
                          )}
                        </button>
                        <pre className="bg-slate-950 text-blue-300 rounded-lg p-4 pr-24 text-xs font-mono overflow-x-auto max-h-[400px] leading-relaxed">
                          {q.kql}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Search size={28} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm">No queries match your filters.</p>
              <button
                onClick={() => {
                  setSearch('');
                  setCatFilter('All');
                  setSevFilter('all');
                  setPlatFilter('all');
                }}
                className="mt-3 px-4 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Reset filters
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
            Queries sourced from{' '}
            <a
              href="https://goxdr.fyi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              GoXDR.fyi
            </a>{' '}
            by GoX. {queries.length} queries loaded.
          </div>
        </>
      </DataState>
    </DataPageLayout>
  );
}
