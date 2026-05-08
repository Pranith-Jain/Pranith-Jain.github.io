import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import {
  FEED_SOURCES,
  fetchIocFeed,
  type SourceId,
  type IocFeedSummary,
  type IocEntry,
} from '../../lib/dfir/ioc-feeds-client';

const DISPLAY_COUNT = 15;

type FeedState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: IocFeedSummary };

function timeAgo(isoString: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TypeBadge({ type }: { type: IocEntry['type'] }): JSX.Element {
  const styles: Record<IocEntry['type'], string> = {
    url: 'text-blue-600 dark:text-blue-400',
    domain: 'text-violet-600 dark:text-violet-400',
    ipv4: 'text-amber-600 dark:text-amber-400',
    hash: 'text-emerald-600 dark:text-emerald-400',
    cve: 'text-rose-600 dark:text-rose-400',
  };
  return <span className={`text-xs font-mono uppercase tracking-wider shrink-0 w-12 ${styles[type]}`}>{type}</span>;
}

function IocRow({ entry }: { entry: IocEntry }): JSX.Element {
  const isCheckable = entry.type !== 'cve';
  const displayValue = entry.value.length > 60 ? entry.value.slice(0, 58) + '…' : entry.value;

  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-900 transition-colors">
      <TypeBadge type={entry.type} />
      <span
        className="font-mono text-xs text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate"
        title={entry.value}
      >
        {displayValue}
      </span>
      {entry.context && (
        <span
          className="hidden sm:block text-xs font-mono text-slate-400 shrink-0 max-w-[150px] truncate"
          title={entry.context}
        >
          {entry.context}
        </span>
      )}
      {isCheckable && (
        <Link
          to={`/dfir/ioc-check?indicator=${encodeURIComponent(entry.value)}`}
          className="shrink-0 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          check
        </Link>
      )}
    </li>
  );
}

export function IocFeedStream(): JSX.Element {
  const [activeId, setActiveId] = useState<SourceId>('urlhaus');
  const [feedStates, setFeedStates] = useState<Partial<Record<SourceId, FeedState>>>({});

  const getState = (id: SourceId): FeedState => feedStates[id] ?? { status: 'idle' };

  const loadFeed = useCallback(
    async (id: SourceId) => {
      const current = feedStates[id];
      if (current?.status === 'loading') return;

      setFeedStates((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      try {
        const data = await fetchIocFeed(id);
        setFeedStates((prev) => ({ ...prev, [id]: { status: 'success', data } }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setFeedStates((prev) => ({ ...prev, [id]: { status: 'error', message } }));
      }
    },
    [feedStates]
  );

  const handleTabClick = (id: SourceId) => {
    setActiveId(id);
    const state = feedStates[id];
    if (!state || state.status === 'idle') {
      void loadFeed(id);
    }
  };

  const handleRefresh = () => {
    setFeedStates((prev) => ({ ...prev, [activeId]: { status: 'idle' } }));
    void loadFeed(activeId);
  };

  const activeState = getState(activeId);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {FEED_SOURCES.map((src) => {
          const isActive = src.id === activeId;
          const state = getState(src.id);
          return (
            <button
              key={src.id}
              type="button"
              onClick={() => handleTabClick(src.id)}
              className={`px-4 py-3 text-xs font-mono whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {src.label}
              {state.status === 'loading' && <Loader2 size={10} className="animate-spin text-brand-500" />}
            </button>
          );
        })}
      </div>

      {/* Feed content */}
      <div className="p-4">
        {activeState.status === 'idle' && (
          <div className="text-center py-10">
            <p className="text-sm text-slate-500 mb-3">Live feed — click to load latest indicators</p>
            <button
              type="button"
              onClick={() => handleTabClick(activeId)}
              className="px-4 py-2 text-xs font-mono rounded border border-brand-500/40 text-brand-600 dark:text-brand-400 hover:bg-brand-500/5 transition-colors"
            >
              Load feed
            </button>
          </div>
        )}

        {activeState.status === 'loading' && (
          <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm font-mono">Fetching upstream feed…</span>
          </div>
        )}

        {activeState.status === 'error' && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30">
            <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-mono text-rose-600 dark:text-rose-400">Failed to load feed</p>
              <p className="text-xs font-mono text-rose-500 mt-0.5 break-all">{activeState.message}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1"
              >
                <RefreshCw size={10} /> Retry
              </button>
            </div>
          </div>
        )}

        {activeState.status === 'success' && (
          <>
            {/* Feed header */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-mono text-slate-500 flex items-center gap-2">
                <span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{activeState.data.count}</span>{' '}
                  entries in feed
                </span>
                {activeState.data.total_in_feed && activeState.data.total_in_feed !== activeState.data.count && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{activeState.data.total_in_feed} total in upstream</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>fetched {timeAgo(activeState.data.fetched_at)}</span>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-xs font-mono text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1 transition-colors"
                title="Refresh feed"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {/* Entries */}
            {activeState.data.entries.length === 0 ? (
              <p className="text-sm font-mono text-slate-400 text-center py-6">No entries returned</p>
            ) : (
              <ul className="space-y-1">
                {activeState.data.entries.slice(0, DISPLAY_COUNT).map((entry, i) => (
                  <IocRow key={`${entry.value}-${i}`} entry={entry} />
                ))}
              </ul>
            )}

            {activeState.data.entries.length > DISPLAY_COUNT && (
              <p className="text-xs font-mono text-slate-400 text-right mt-2">
                Showing {DISPLAY_COUNT} of {activeState.data.count}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
