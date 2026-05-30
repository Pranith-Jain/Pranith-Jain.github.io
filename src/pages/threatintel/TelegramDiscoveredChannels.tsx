import { useEffect, useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { ArrowLeft, RefreshCw, Radio, ExternalLink, Check, Search } from 'lucide-react';

interface DiscoveredChannel {
  id: number;
  handle: string;
  source_message: string | null;
  reviewed: number;
  added_to_watch: number;
  discovered_at: string;
}

export default function TelegramDiscoveredChannels(): JSX.Element {
  const [channels, setChannels] = useState<DiscoveredChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [approving, setApproving] = useState<string | null>(null);
  const [filterReviewed, setFilterReviewed] = useState<string>('false');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterReviewed === 'true') params.set('reviewed', 'true');
      else if (filterReviewed === 'false') params.set('reviewed', 'false');
      const res = await fetch(`/api/v1/telegram-leaks/discovered-channels?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { channels: DiscoveredChannel[] };
      setChannels(d.channels ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filterReviewed]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleApprove = async (handle: string) => {
    setApproving(handle);
    try {
      const res = await fetch('/api/v1/telegram-leaks/approve-channel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle, category: 'auto-discovered' }),
      });
      if (!res.ok) throw new Error('Approval failed');
      setChannels((prev) => prev.filter((ch) => ch.handle !== handle));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(null);
    }
  };

  const filtered = channels.filter((ch) => !search || ch.handle.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
            <Radio size={28} className="text-brand-600 dark:text-brand-400" /> Discovered Telegram Channels
          </h1>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-[11px] font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 mt-1"
            aria-label="Refresh"
          >
            <RefreshCw size={11} /> refresh
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl leading-relaxed">
          Channels auto-discovered from messages in monitored feeds and bot-subscribed chats. Review and approve to add
          them to the watchlist for leak scanning.
        </p>
      </div>

      <div className="animate-fade-in-up mb-8 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter handles…"
            className="w-48 px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 font-mono"
          />
        </div>

        <select
          value={filterReviewed}
          onChange={(e) => setFilterReviewed(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
        >
          <option value="false">Unreviewed only</option>
          <option value="true">Reviewed only</option>
          <option value="">All</option>
        </select>
      </div>

      <DataState loading={loading} error={error} rows={6}>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 dark:text-slate-500">
            <Radio size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-sm font-mono">No discovered channels</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((ch) => (
              <div
                key={ch.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {ch.handle}
                    </span>
                    {ch.reviewed === 1 && (
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400">
                        reviewed
                      </span>
                    )}
                    {ch.added_to_watch === 1 && (
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400">
                        watched
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span>discovered {new Date(ch.discovered_at).toLocaleString()}</span>
                    {ch.source_message && (
                      <a
                        href={ch.source_message}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        <ExternalLink size={10} /> source
                      </a>
                    )}
                  </div>
                </div>

                {ch.reviewed === 0 && (
                  <button
                    type="button"
                    onClick={() => handleApprove(ch.handle)}
                    disabled={approving === ch.handle}
                    className="shrink-0 text-[11px] font-mono px-3 py-1.5 rounded border border-green-600/40 text-green-700 dark:text-green-400 hover:bg-green-500/10 disabled:opacity-40 inline-flex items-center gap-1.5"
                  >
                    <Check size={12} /> {approving === ch.handle ? 'approving…' : 'approve'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </DataState>
    </div>
  );
}
