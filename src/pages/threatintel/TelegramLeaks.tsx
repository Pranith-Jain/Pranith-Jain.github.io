import { useEffect, useState } from 'react';
import { DataState } from '../../components/DataState';
import { Search, RefreshCw, AlertTriangle, FileText, ExternalLink } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { SEVERITY_TONE } from '../../components/severity';

interface LeakEntry {
  id: number;
  channel_handle: string;
  message_link: string;
  message_text: string;
  leak_type: 'credential' | 'paste_link' | 'file_link' | 'keyword';
  credential_count: number;
  domains_found: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file_name: string | null;
  discovered_at: string;
}

const LEAK_TYPE_ICONS: Record<string, typeof FileText> = {
  credential: AlertTriangle,
  paste_link: ExternalLink,
  file_link: FileText,
  keyword: Search,
  ioc: AlertTriangle,
  cve: AlertTriangle,
};

export default function TelegramLeaks(): JSX.Element {
  const [entries, setEntries] = useState<LeakEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [channels, setChannels] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (severityFilter) params.set('severity', severityFilter);
    if (channelFilter) params.set('channel', channelFilter);
    params.set('limit', String(pageSize));
    if (offset > 0) params.set('offset', String(offset));

    fetch(`/api/v1/telegram-leaks/search?${params}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ entries: LeakEntry[]; count: number }>;
      })
      .then((d) => {
        if (!cancelled) setEntries(d.entries ?? []);
      })
      .catch((e) => {
        if (!cancelled && e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey, search, severityFilter, channelFilter, offset]);

  // Reset pagination to page 1 whenever a filter changes — otherwise a new
  // query runs with a stale offset and can render a false "no results".
  useEffect(() => {
    setOffset(0);
  }, [search, severityFilter, channelFilter]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/telegram-leaks/watched-channels', { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ channels: { handle: string }[] }>) : null))
      .then((d) => {
        if (!cancelled && d?.channels) setChannels(d.channels.map((c) => c.handle));
      })
      .catch((err) => {
        setError((prev) => prev ?? (err instanceof Error ? err.message : String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
            <AlertTriangle size={28} className="text-brand-600 dark:text-brand-400" /> Telegram Leak Monitor
          </h1>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1 mt-1"
            aria-label="Refresh"
          >
            <RefreshCw size={11} /> refresh
          </button>
        </div>
        <p className="text-muted mb-8 max-w-3xl leading-relaxed">
          Credential leaks, paste dumps, and file leaks detected across monitored Telegram channels and bot-subscribed
          chats. Severity: <span className="text-rose-500 font-semibold">critical</span> &gt;{' '}
          <span className="text-orange-500 font-semibold">high</span> &gt;{' '}
          <span className="text-amber-500 font-semibold">medium</span> &gt;{' '}
          <span className="text-slate-400 font-semibold">low</span>.
        </p>
      </div>

      {/* Filters */}
      <div className="animate-fade-in-up mb-8 flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search leaks…"
            className="w-56 px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 font-mono"
          />
          <button
            type="submit"
            className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <Search size={11} /> search
          </button>
        </form>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-slate-100 font-mono"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-slate-100 font-mono"
        >
          <option value="">All channels</option>
          {channels.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      <DataState loading={loading} error={error} rows={8}>
        {entries.length === 0 ? (
          <div className="text-center py-16 text-slate-500 dark:text-slate-500">
            <Search size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-sm font-mono">No leak entries found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const TypeIcon = LEAK_TYPE_ICONS[entry.leak_type] ?? FileText;
              const domains: string[] = entry.domains_found
                ? (() => {
                    try {
                      return JSON.parse(entry.domains_found);
                    } catch {
                      return [];
                    }
                  })()
                : [];
              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <TypeIcon size={14} className="shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                        {entry.channel_handle}
                      </span>
                      <span
                        className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[entry.severity] ?? SEVERITY_TONE.low}`}
                      >
                        {entry.severity}
                      </span>
                      <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
                        {entry.leak_type}
                      </span>
                    </div>
                    <span className="text-micro font-mono text-slate-400 dark:text-slate-500 shrink-0">
                      {new Date(entry.discovered_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3 mb-2 leading-relaxed font-mono">
                    {entry.message_text}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-micro font-mono text-slate-500 dark:text-slate-400">
                    {entry.credential_count > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle size={10} /> {entry.credential_count} credentials
                      </span>
                    )}
                    {domains.length > 0 && (
                      <span className="truncate max-w-[200px]">
                        domains: {domains.slice(0, 3).join(', ')}
                        {domains.length > 3 && ' …'}
                      </span>
                    )}
                    {entry.file_name && (
                      <span className="inline-flex items-center gap-1">
                        <FileText size={10} /> {entry.file_name}
                      </span>
                    )}
                    {entry.message_link && (
                      <a
                        href={sanitizeUrl(entry.message_link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline ml-auto"
                      >
                        <ExternalLink size={10} /> source
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DataState>

      {entries.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(0, prev - pageSize))}
            className="text-mini font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← previous
          </button>
          <span className="text-mini font-mono text-slate-500 dark:text-slate-400">
            {offset + 1}–{offset + entries.length}
          </span>
          <button
            type="button"
            disabled={entries.length < pageSize}
            onClick={() => setOffset((prev) => prev + pageSize)}
            className="text-mini font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
