import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Bot, Search, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface HistoryEntry {
  id: string;
  query: string;
  queryType: string;
  qualityScore: number;
  modelUsed: string;
  completedAt: string;
  iocCount: number;
  actorCount: number;
  keyFindings: string[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  if (score > 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-slate-400';
}

export default function InvestigationHistory(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/v1/agent/history?limit=50')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { entries: HistoryEntry[] };
        setEntries(data.entries);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = entries.filter(
    (e) =>
      !search ||
      e.query.toLowerCase().includes(search.toLowerCase()) ||
      e.keyFindings.some((f) => f.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Clock size={28} />}
      title="Investigation History"
      description="Browse past investigations, their outcomes, and key findings."
      loading={loading}
      error={error}
      empty={entries.length === 0}
      emptyMessage="No investigations completed yet."
      maxWidthClass="max-w-5xl"
    >
      {entries.length > 0 && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search queries or findings…"
              className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((entry) => (
          <Link
            key={entry.id}
            to={`/dfir/agent?query=${encodeURIComponent(entry.query)}`}
            className="surface-card p-4 block hover:border-brand-500/40 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Bot size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {entry.query}
                  </span>
                  <ExternalLink
                    size={12}
                    className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{timeAgo(entry.completedAt)}</span>
                  <span className="font-mono">{entry.queryType}</span>
                  {entry.iocCount > 0 && <span>{entry.iocCount} IOCs</span>}
                  {entry.actorCount > 0 && <span>{entry.actorCount} actors</span>}
                </div>
                {entry.keyFindings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.keyFindings.slice(0, 3).map((f, i) => (
                      <span
                        key={i}
                        className="text-mini font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300 truncate max-w-[200px]"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className={`text-lg font-bold font-mono ${scoreColor(entry.qualityScore)}`}>
                  {entry.qualityScore > 0 ? entry.qualityScore : '—'}
                </div>
                <div className="text-mini text-slate-400">QA</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </DataPageLayout>
  );
}
