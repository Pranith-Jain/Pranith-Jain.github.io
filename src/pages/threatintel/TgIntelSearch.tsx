/**
 * /threatintel/tools/tg-intel-search -- Telegram Intelligence Search
 *
 * TraceOn.re-inspired advanced search for Telegram leak data:
 * - Boolean AND/OR/NOT with field qualifiers
 * - Interactive timeline chart (click-to-drill)
 * - Visual filter pills (channel, severity, date range)
 * - IOC auto-extraction per message (side panel)
 * - Saved searches
 * - Sender/channel pivot
 */

import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  Search,
  Trash2,
  Bookmark,
  X,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Filter,
  BarChart3,
  Loader2,
  AlertTriangle,
  Eye,
  ArrowLeft,
  Star,
  ChevronUp,
  Shield,
  Globe,
  Mail,
  Hash,
  Link2,
  Server,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────

interface LeakEntry {
  id: number;
  channel_handle: string;
  message_link: string;
  message_text: string;
  leak_type: string;
  credential_count: number;
  file_url: string;
  file_name: string;
  domains_found: string;
  severity: string;
  discovered_at: string;
}

interface TimelinePoint {
  day: string;
  count: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  mode: string;
  filters: string;
  sort_order: string;
  date_range: string;
  created_at: string;
}

interface ParsedIOC {
  type: string;
  value: string;
}

// ─── IOC Extraction (client-side, mirrors si_parse patterns) ──────────

const IOC_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'ipv4', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
  {
    type: 'domain',
    regex: /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|ru|cn|ir|onion|top|xyz|cc|pw|su|biz|info|me)\b/gi,
  },
  { type: 'email', regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
  { type: 'sha256', regex: /\b[A-Fa-f0-9]{64}\b/g },
  { type: 'md5', regex: /\b[A-Fa-f0-9]{32}\b/g },
  { type: 'cve', regex: /CVE-\d{4}-\d{4,}/gi },
  { type: 'url', regex: /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi },
  { type: 'btc', regex: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g },
  { type: 'eth', regex: /\b0x[a-fA-F0-9]{40}\b/g },
  { type: 'onion', regex: /\b[a-z2-7]{16,56}\.onion\b/gi },
];

function extractIOCs(text: string): ParsedIOC[] {
  const seen = new Set<string>();
  const results: ParsedIOC[] = [];
  for (const { type, regex } of IOC_PATTERNS) {
    const matches = text.match(regex) || [];
    for (const m of matches) {
      const key = `${type}:${m.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ type, value: m });
      }
    }
  }
  return results;
}

const IOC_COLORS: Record<string, string> = {
  ipv4: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  domain: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  email: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  sha256: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  md5: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  cve: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  url: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  btc: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  eth: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  onion: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};

const IOC_ICONS: Record<string, typeof Server> = {
  ipv4: Server,
  domain: Globe,
  email: Mail,
  sha256: Hash,
  md5: Hash,
  cve: Shield,
  url: Link2,
  btc: Globe,
  eth: Globe,
  onion: Globe,
};

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  low: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const LEAK_TYPE_COLORS: Record<string, string> = {
  credential: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  paste_link: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  file_link: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  keyword: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  ioc: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  cve: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  unknown: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

// ─── Component ────────────────────────────────────────────────────────

export default function TgIntelSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'boolean' | 'general'>('boolean');
  const [results, setResults] = useState<LeakEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  // Filters
  const [filterChannel, setFilterChannel] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Timeline
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [topChannels, setTopChannels] = useState<Array<{ channel_handle: string; count: number }>>([]);
  const [timelineDays, setTimelineDays] = useState(30);

  // Saved searches
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  // IOC panel
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedIOC, setCopiedIOC] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const apiBase = '/api/v1';

  // ─── Search ─────────────────────────────────────────────────────

  const doSearch = useCallback(
    async (q: string, offset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q,
          mode,
          limit: String(limit),
          offset: String(offset),
          sort: 'newest',
        });
        if (filterChannel) params.set('channel', filterChannel);
        if (filterSeverity) params.set('severity', filterSeverity);
        if (filterFrom) params.set('from', filterFrom);
        if (filterTo) params.set('to', filterTo);

        const [searchRes, timelineRes] = await Promise.all([
          fetch(`${apiBase}/tg-search?${params}`).then((r) => r.json()),
          fetch(
            `${apiBase}/tg-timeline?q=${encodeURIComponent(q)}&days=${timelineDays}${filterChannel ? `&channel=${filterChannel}` : ''}`
          ).then((r) => r.json()),
        ]);

        setResults(searchRes.results || []);
        setTotal(searchRes.total || 0);
        setPage(Math.floor(offset / limit));
        setTimeline(timelineRes.timeline || []);
        setTopChannels(timelineRes.topChannels || []);
      } catch {
        setError('Search failed');
      }
      setLoading(false);
    },
    [mode, filterChannel, filterSeverity, filterFrom, filterTo, timelineDays]
  );

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    doSearch(query, 0);
  };

  const handleTimelineClick = (day: string) => {
    setFilterFrom(day);
    setFilterTo(day);
    doSearch(query, 0);
  };

  // ─── Saved Searches ───────────────────────────────────────────

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/tg-saved-searches`);
      const data = await res.json();
      setSavedSearches(data.searches || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  const handleSave = async () => {
    if (!saveName.trim() || !query.trim()) return;
    try {
      await fetch(`${apiBase}/tg-saved-searches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName, query, mode, sort_order: 'newest' }),
      });
      setSaveName('');
      setShowSaveForm(false);
      fetchSaved();
    } catch {
      /* ignore */
    }
  };

  const handleDeleteSaved = async (id: string) => {
    await fetch(`${apiBase}/tg-saved-searches/${id}`, { method: 'DELETE' });
    fetchSaved();
  };

  const loadSaved = (s: SavedSearch) => {
    setQuery(s.query);
    setMode(s.mode as 'boolean' | 'general');
    setShowSaved(false);
    doSearch(s.query, 0);
  };

  // ─── IOC Panel ────────────────────────────────────────────────

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIOC(text);
    setTimeout(() => setCopiedIOC(null), 1500);
  };

  // ─── Timeline Chart ───────────────────────────────────────────

  const maxCount = Math.max(...timeline.map((t) => t.count), 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Telegram Intelligence Search</h1>
          <p className="text-sm font-mono text-muted max-w-2xl">
            Boolean AND/OR/NOT search across indexed Telegram messages. Field qualifiers, IOC auto-extraction, timeline
            visualization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
          >
            <Bookmark size={12} /> Saved ({savedSearches.length})
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
          >
            <Filter size={12} /> Filters
          </button>
        </div>
      </div>

      {/* Saved Searches Dropdown */}
      {showSaved && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm">Saved Searches</h3>
            <button
              onClick={() => setShowSaved(false)}
              className="text-muted hover:text-slate-900 dark:hover:text-slate-100"
            >
              <X size={14} />
            </button>
          </div>
          {savedSearches.length === 0 ? (
            <p className="text-xs font-mono text-muted">No saved searches yet.</p>
          ) : (
            <div className="space-y-2">
              {savedSearches.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-[rgb(var(--surface-100))]"
                >
                  <button onClick={() => loadSaved(s)} className="text-left flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.name}</p>
                    <p className="text-xs font-mono text-muted truncate">{s.query}</p>
                  </button>
                  <button
                    onClick={() => handleDeleteSaved(s.id)}
                    className="text-slate-300 dark:text-slate-600 hover:text-red-500 p-1 ml-2"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden flex-1">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'boolean' | 'general')}
              className="px-3 py-2.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border-r border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 focus:outline-none"
            >
              <option value="boolean">Boolean</option>
              <option value="general">General</option>
            </select>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'boolean' ? 'ransomware AND channel.title:"TeamPCP" NOT tutorial' : 'search keywords...'
              }
              className="flex-1 px-3 py-2.5 bg-transparent font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setTotal(0);
                  setTimeline([]);
                }}
                className="px-2 text-muted hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors"
          >
            <Search size={14} />
          </button>
          {query && (
            <button
              type="button"
              onClick={() => {
                setShowSaveForm(true);
              }}
              className="px-3 py-2.5 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs font-semibold text-muted hover:text-slate-900 dark:hover:text-slate-100 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
            >
              <Star size={14} />
            </button>
          )}
        </div>
      </form>

      {/* Save Form */}
      {showSaveForm && (
        <div className="mb-4 flex gap-2 items-center">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Search name..."
            className="flex-1 max-w-xs px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={handleSave}
            className="px-3 py-2 bg-brand-600 dark:bg-brand-500 text-white text-xs font-mono font-semibold rounded-lg"
          >
            Save
          </button>
          <button
            onClick={() => setShowSaveForm(false)}
            className="text-muted hover:text-slate-900 dark:hover:text-slate-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter Pills */}
      {showFilters && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="tg-filter-channel" className="block text-xs font-mono text-muted mb-1">
                Channel
              </label>
              <input
                id="tg-filter-channel"
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                placeholder="@handle"
                className="px-3 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs focus:outline-none focus:border-brand-500 w-40"
              />
            </div>
            <div>
              <label htmlFor="tg-filter-severity" className="block text-xs font-mono text-muted mb-1">
                Severity
              </label>
              <select
                id="tg-filter-severity"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs focus:outline-none"
              >
                <option value="">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label htmlFor="tg-filter-from" className="block text-xs font-mono text-muted mb-1">
                From
              </label>
              <input
                id="tg-filter-from"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label htmlFor="tg-filter-to" className="block text-xs font-mono text-muted mb-1">
                To
              </label>
              <input
                id="tg-filter-to"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label htmlFor="tg-filter-timeline" className="block text-xs font-mono text-muted mb-1">
                Timeline
              </label>
              <select
                id="tg-filter-timeline"
                value={timelineDays}
                onChange={(e) => setTimelineDays(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs focus:outline-none"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            </div>
            <button
              onClick={() => doSearch(query, 0)}
              className="mt-5 px-4 py-1.5 bg-brand-600 dark:bg-brand-500 text-white text-xs font-mono font-semibold rounded-lg"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Active filter pills */}
      {(filterChannel || filterSeverity || filterFrom || filterTo) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {filterChannel && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-mono border border-sky-200 dark:border-sky-800">
              @{filterChannel}{' '}
              <button
                onClick={() => {
                  setFilterChannel('');
                  doSearch(query, 0);
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {filterSeverity && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono border ${SEV_COLORS[filterSeverity] || SEV_COLORS.low}`}
            >
              {filterSeverity}{' '}
              <button
                onClick={() => {
                  setFilterSeverity('');
                  doSearch(query, 0);
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {filterFrom && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-mono border border-emerald-200 dark:border-emerald-800">
              From: {filterFrom}{' '}
              <button
                onClick={() => {
                  setFilterFrom('');
                  doSearch(query, 0);
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {filterTo && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-mono border border-emerald-200 dark:border-emerald-800">
              To: {filterTo}{' '}
              <button
                onClick={() => {
                  setFilterTo('');
                  doSearch(query, 0);
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Timeline Chart */}
      {timeline.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <BarChart3 size={14} className="text-brand-500" /> Activity Timeline
            </h3>
            <span className="text-xs font-mono text-muted">{total.toLocaleString()} events</span>
          </div>
          <div className="flex items-end gap-px h-24 overflow-x-auto">
            {timeline.map((t) => (
              <button
                key={t.day}
                onClick={() => handleTimelineClick(t.day)}
                title={`${t.day}: ${t.count} messages`}
                className="flex-1 min-w-[3px] rounded-t transition-opacity hover:opacity-80 group relative"
                style={{
                  height: `${Math.max((t.count / maxCount) * 100, 2)}%`,
                  background: `linear-gradient(to top, 
                    var(--color-emerald-500) 0%, 
                    var(--color-amber-500) ${Math.min(100, ((t.medium + t.high) / Math.max(t.count, 1)) * 100)}%, 
                    var(--color-red-500) ${Math.min(100, (t.critical / Math.max(t.count, 1)) * 100)}%)`,
                }}
              >
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-mono rounded whitespace-nowrap z-10">
                  {t.day}: {t.count}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] font-mono text-muted">
            <span>{timeline[0]?.day}</span>
            <span>{timeline[timeline.length - 1]?.day}</span>
          </div>
        </div>
      )}

      {/* Results */}
      {loading && (
        <div className="flex items-center gap-2 text-muted py-12 justify-center font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Searching...
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center gap-2 font-mono text-sm mb-4">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-muted">{total.toLocaleString()} results</span>
            <div className="flex items-center gap-2">
              {topChannels.slice(0, 5).map((tc) => (
                <button
                  key={tc.channel_handle}
                  onClick={() => {
                    setFilterChannel(tc.channel_handle);
                    doSearch(query, 0);
                  }}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  @{tc.channel_handle} ({tc.count})
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {results.map((entry) => {
              const iocs = extractIOCs(entry.message_text || '');
              const isExpanded = expandedId === entry.id;
              const domains: string[] = (() => {
                try {
                  return JSON.parse(entry.domains_found || '[]');
                } catch {
                  return [];
                }
              })();

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden"
                >
                  {/* Row */}
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-100))] transition-colors"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(entry.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(entry.id);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400">
                          @{entry.channel_handle}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${SEV_COLORS[entry.severity] || SEV_COLORS.low}`}
                        >
                          {entry.severity}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${LEAK_TYPE_COLORS[entry.leak_type] || LEAK_TYPE_COLORS.unknown}`}
                        >
                          {entry.leak_type}
                        </span>
                        {entry.credential_count > 0 && (
                          <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400">
                            {entry.credential_count} creds
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted ml-auto">
                          {entry.discovered_at?.split('T')[0]}
                        </span>
                      </div>
                      <p
                        className={`text-sm font-mono text-slate-700 dark:text-slate-300 ${isExpanded ? '' : 'line-clamp-2'}`}
                      >
                        {entry.message_text || '(no text)'}
                      </p>
                      {domains.length > 0 && !isExpanded && (
                        <div className="flex gap-1 mt-1.5">
                          {domains.slice(0, 3).map((d) => (
                            <span
                              key={d}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400"
                            >
                              {d}
                            </span>
                          ))}
                          {domains.length > 3 && (
                            <span className="text-[10px] font-mono text-muted">+{domains.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {iocs.length > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                          {iocs.length} IOC
                        </span>
                      )}
                      {entry.message_link && (
                        <a
                          href={entry.message_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted hover:text-brand-500 p-1"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={14} className="text-muted" />
                      ) : (
                        <ChevronDown size={14} className="text-muted" />
                      )}
                    </div>
                  </div>

                  {/* Expanded IOC Panel */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-[rgb(var(--border-300))] p-4 bg-slate-50 dark:bg-[rgb(var(--surface-100))]">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye size={12} className="text-brand-500" />
                        <h4 className="text-xs font-display font-semibold">Observables</h4>
                        <span className="text-[10px] font-mono text-muted">({iocs.length} extracted)</span>
                      </div>
                      {iocs.length === 0 ? (
                        <p className="text-xs font-mono text-muted">No IOCs detected in this message.</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(
                            iocs.reduce(
                              (acc, ioc) => {
                                (acc[ioc.type] = acc[ioc.type] || []).push(ioc);
                                return acc;
                              },
                              {} as Record<string, ParsedIOC[]>
                            )
                          ).map(([type, items]) => {
                            const Icon = IOC_ICONS[type] || Globe;
                            return (
                              <div key={type}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Icon size={10} className="text-muted" />
                                  <span className="text-[10px] font-mono font-semibold text-muted uppercase">
                                    {type}
                                  </span>
                                  <span className="text-[10px] font-mono text-muted">({items.length})</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {items.map((ioc) => (
                                    <button
                                      key={ioc.value}
                                      onClick={() => copyToClipboard(ioc.value)}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${IOC_COLORS[ioc.type] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'} hover:opacity-80 transition-opacity`}
                                    >
                                      {ioc.value.length > 40 ? ioc.value.slice(0, 40) + '...' : ioc.value}
                                      {copiedIOC === ioc.value ? (
                                        <Check size={8} />
                                      ) : (
                                        <Copy size={8} className="opacity-50" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Domains from DB */}
                      {domains.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                          <span className="text-[10px] font-mono font-semibold text-muted">Domains found:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {domains.map((d) => (
                              <button
                                key={d}
                                onClick={() => copyToClipboard(d)}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:opacity-80"
                              >
                                {d}{' '}
                                {copiedIOC === d ? <Check size={8} /> : <Copy size={8} className="opacity-50 inline" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sender pivot */}
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                        <Link
                          to={`/threatintel/telegram-monitor?tab=leaks&q=${encodeURIComponent(`channel.title:"${entry.channel_handle}"`)}`}
                          className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          View all from @{entry.channel_handle} →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => doSearch(query, Math.max(0, (page - 1) * limit))}
                disabled={page === 0}
                className="px-4 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] disabled:opacity-40 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs font-mono text-muted">
                Page {page + 1} of {Math.ceil(total / limit)}
              </span>
              <button
                onClick={() => doSearch(query, (page + 1) * limit)}
                disabled={(page + 1) * limit >= total}
                className="px-4 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] disabled:opacity-40 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && query && !error && (
        <div className="text-center py-16 text-muted">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-display font-semibold text-lg mb-1">No results found</p>
          <p className="font-mono text-sm">Try a different query or adjust filters</p>
        </div>
      )}

      {/* Initial state */}
      {!query && results.length === 0 && !loading && (
        <div className="text-center py-16 text-muted">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-display font-semibold text-lg mb-1">Telegram Intelligence Search</p>
          <p className="font-mono text-sm mb-4">Search across indexed Telegram messages with boolean operators</p>
          <div className="max-w-md mx-auto text-left space-y-2 text-xs font-mono">
            <p className="text-slate-500 dark:text-slate-500">Examples:</p>
            <p className="text-slate-700 dark:text-slate-300">ransomware AND "dark web"</p>
            <p className="text-slate-700 dark:text-slate-300">channel.title:"TeamPCP" AND text:credential</p>
            <p className="text-slate-700 dark:text-slate-300">stealer NOT tutorial</p>
            <p className="text-slate-700 dark:text-slate-300">.onion AND marketplace</p>
          </div>
        </div>
      )}
    </div>
  );
}
