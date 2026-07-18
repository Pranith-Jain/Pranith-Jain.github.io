import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { LayoutDashboard, Trash2, Search, Globe, Mail, ShieldAlert } from 'lucide-react';
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
    <DataPageLayout
      backTo="/dfir"
      icon={<LayoutDashboard size={28} />}
      title="Toolkit dashboard"
      description="A glance at your recent activity — last 20 queries, kept anonymously in this browser. Nothing is sent anywhere."
      maxWidthClass="max-w-3xl"
      headerExtra={
        entries.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          >
            <Trash2 size={14} /> clear history
          </button>
        ) : undefined
      }
    >
      {/* At-a-glance stats — derived from local history. */}
      <div className="stagger grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {[
          { k: 'Lookups', v: String(stats.total) },
          { k: 'Tools used', v: String(stats.distinct) },
          { k: 'Most used', v: stats.top },
          { k: 'Last run', v: stats.last },
        ].map((s) => (
          <div key={s.k} className="surface-card px-4 py-3.5">
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
              className="group flex items-center gap-2.5 surface-card px-3.5 py-3 text-sm font-medium transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-brand-50 text-brand-600 ring-1 ring-brand-200/60 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20 transition-colors">
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
    </DataPageLayout>
  );
}
