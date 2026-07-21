import { useMemo, useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Bot, Search as SearchIcon, AlertTriangle, ChevronRight, Activity } from 'lucide-react';

interface AiThreatsIndex {
  counts: { total: number; main: number; deepfake: number };
  source: string;
  sourceUrl: string;
  license: string;
  lastSyncedAt: string | null;
}

interface Entry {
  slug: string;
  name: string;
  akas: string;
  brief: string;
  ttps: string[];
  categories: string[];
  reported: string;
  activity: string;
  table: string;
}

interface EntryDetail {
  slug: string;
  name: string;
  akas: string;
  brief: string;
  ttpMd: string;
  ttps: string[];
  categories: string[];
  reported: string;
  activity: string;
  table: string;
}

const TTP_COLORS: Record<string, string | undefined> = {
  T1587: 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40',
  T1588: 'text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40',
  T1566: 'text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40',
  T1059: 'text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40',
  T1592: 'text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40',
  T1593: 'text-cyan-600 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40',
};

function ttpColor(ttp: string): string {
  const base = ttp.split('.')[0] as keyof typeof TTP_COLORS;
  return TTP_COLORS[base] ?? 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/40';
}

const TABLE_STYLES: Record<string, string> = {
  main: 'text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  deepfake:
    'text-fuchsia-600 dark:text-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-950/40 border-fuchsia-300 dark:border-fuchsia-800',
};

export default function AIThreats() {
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('');

  const { data: index, loading, error } = useDataFetch<AiThreatsIndex>({ url: '/api/v1/ai-threats/', ttl: 120_000 });
  const { data: entryDetail } = useDataFetch<EntryDetail>({
    url: selectedEntry ? `/api/v1/ai-threats/entries/${encodeURIComponent(selectedEntry)}` : null,
    ttl: 120_000,
  });

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (searchTerm) p.set('q', searchTerm);
    if (tableFilter) p.set('table', tableFilter);
    p.set('limit', '200');
    return p.toString();
  }, [searchTerm, tableFilter]);

  const { data: listData } = useDataFetch<{ total: number; returned: number; entries: Entry[] }>({
    url: `/api/v1/ai-threats/entries?${queryParams}`,
    ttl: 30_000,
  });

  const entries = listData?.entries ?? [];

  return (
    <DataPageLayout
      backTo="/threat-intel"
      backLabel="Threat Intel"
      icon={<Bot />}
      title="AI Threat Actors"
      description="Tracked real-world threat-actor uses of AI/LLMs from the Cybershujin tracker"
    >
      <div className="mb-6 space-y-4">
        {loading && (
          <div className="grid grid-cols-3 gap-4">
            {['Total Entries', 'Main Tracker', 'Deepfake'].map((label) => (
              <div key={label} className="h-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Failed to load AI Threats index: <span className="font-mono">{error}</span>
          </div>
        )}
        {!loading && !error && index && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Total Entries</div>
              <div className="mt-1 text-2xl font-semibold">{index.counts.total}</div>
            </div>
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Main Tracker</div>
              <div className="mt-1 text-2xl font-semibold">{index.counts.main}</div>
            </div>
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Deepfake</div>
              <div className="mt-1 text-2xl font-semibold">{index.counts.deepfake}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actors, TTPs, categories..."
              className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-3 py-2 text-sm"
          >
            <option value="">All Tables</option>
            <option value="main">Main</option>
            <option value="deepfake">Deepfake</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {entries.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-sm text-muted">
            {searchTerm || tableFilter
              ? 'No entries match your filters.'
              : 'No entries found. Ensure data is built (see README).'}
          </div>
        )}

        {entries.map((entry) => (
          <button
            key={entry.slug}
            onClick={() => setSelectedEntry(selectedEntry === entry.slug ? null : entry.slug)}
            className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3 text-left transition-colors hover:bg-white/80 dark:hover:bg-[rgb(var(--card-bg))]/80"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{entry.name}</span>
                  {entry.akas && <span className="truncate text-xs text-muted">{entry.akas}</span>}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${TABLE_STYLES[entry.table as keyof typeof TABLE_STYLES] ?? TABLE_STYLES.main}`}
                  >
                    {entry.table}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted line-clamp-2">{entry.brief}</p>
                {entry.ttps.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.ttps.slice(0, 5).map((ttp) => (
                      <span
                        key={ttp}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${ttpColor(ttp)}`}
                      >
                        {ttp}
                      </span>
                    ))}
                    {entry.ttps.length > 5 && <span className="text-[10px] text-muted">+{entry.ttps.length - 5}</span>}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted">
                  {entry.reported && (
                    <span className="flex items-center gap-1">
                      <AlertTriangle size={10} />
                      Reported: {entry.reported}
                    </span>
                  )}
                  {entry.activity && (
                    <span className="flex items-center gap-1">
                      <Activity size={10} />
                      {entry.activity}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                size={16}
                className={`mt-1 shrink-0 text-muted transition-transform ${selectedEntry === entry.slug ? 'rotate-90' : ''}`}
              />
            </div>

            {selectedEntry === entry.slug && entryDetail && entryDetail.slug === entry.slug && (
              <div className="mt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3">
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="mb-1 font-medium text-muted">Full Brief</div>
                    <p className="leading-relaxed text-foreground">{entryDetail.brief}</p>
                  </div>
                  {entryDetail.ttpMd && (
                    <div>
                      <div className="mb-1 font-medium text-muted">TTP Mapping</div>
                      <div
                        className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: entryDetail.ttpMd
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>'),
                        }}
                      />
                    </div>
                  )}
                  {entryDetail.ttps.length > 0 && (
                    <div>
                      <div className="mb-1 font-medium text-muted">MITRE ATT&CK Techniques</div>
                      <div className="flex flex-wrap gap-1">
                        {entryDetail.ttps.map((ttp) => (
                          <span
                            key={ttp}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${ttpColor(ttp)}`}
                          >
                            {ttp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </DataPageLayout>
  );
}
