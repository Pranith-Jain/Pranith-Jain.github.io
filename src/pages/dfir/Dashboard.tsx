import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Trash2, Search, Globe, Mail, ShieldAlert } from 'lucide-react';
import { readHistory, clearHistory, type HistoryEntry } from '../../lib/dfir/history';
import { HistoryRow } from '../../components/dfir/HistoryRow';
import { DataState } from '../../components/DataState';

const QUICK = [
  { to: '/dfir/ioc-check', label: 'IOC checker', icon: Search },
  { to: '/dfir/domain', label: 'Domain triage', icon: Globe },
  { to: '/dfir/phishing', label: 'Phishing analyzer', icon: Mail },
  { to: '/dfir/exposure', label: 'Exposure scan', icon: ShieldAlert },
];

function relative(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Dashboard(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setEntries(readHistory());
  }, []);

  const handleClear = () => {
    clearHistory();
    setEntries([]);
  };

  const stats = useMemo(() => {
    const tools = new Set(entries.map((e) => e.tool));
    const byTool = [...entries.reduce((m, e) => m.set(e.tool, (m.get(e.tool) ?? 0) + 1), new Map<string, number>())];
    const top = byTool.sort((a, b) => b[1] - a[1])[0];
    return {
      total: entries.length,
      distinct: tools.size,
      top: top ? top[0] : '—',
      last: entries[0] ? relative(entries[0].timestamp) : '—',
    };
  }, [entries]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-8"
      >
        <ArrowLeft size={14} /> back to toolkit
      </BackLink>

      <div className="flex items-end justify-between gap-4 mb-8">
        <div className="animate-fade-in-up">
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-2">Toolkit dashboard</h1>
          <p className="text-muted max-w-xl leading-relaxed">
            A glance at your recent activity — last 20 queries, kept anonymously in this browser. Nothing is sent
            anywhere.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          >
            <Trash2 size={14} /> clear history
          </button>
        )}
      </div>

      {/* At-a-glance stats — derived from local history. */}
      <div className="stagger grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {[
          { k: 'Lookups', v: String(stats.total) },
          { k: 'Tools used', v: String(stats.distinct) },
          { k: 'Most used', v: stats.top },
          { k: 'Last run', v: stats.last },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 px-4 py-3.5"
          >
            <div className="text-mini font-mono uppercase tracking-[0.16em] text-slate-500">{s.k}</div>
            <div className="mt-1 font-display font-bold text-xl text-slate-900 dark:text-slate-100 truncate">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Quick launch */}
      <div className="mb-12">
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          Quick launch
        </h2>
        <div className="stagger grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 px-3.5 py-3 text-sm font-medium transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600 ring-1 ring-brand-200/60 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20 transition-colors">
                <Icon size={15} aria-hidden="true" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
        Recent lookups
      </h2>
      <DataState
        empty={entries.length === 0}
        emptyLabel="No lookups yet — run the IOC checker or any tool and they’ll show up here."
      >
        <ul className="stagger space-y-2">
          {entries.map((e) => (
            <HistoryRow key={e.id} e={e} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}
