import { useState, useCallback } from 'react';
import { ArrowLeft, BookOpen, Calendar, FileText, Globe, Loader2, Search, User, Hash } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';

interface ThreatActor {
  main_name: string;
  aliases?: string[];
  id: string;
}

interface ReportFiles {
  pdf?: string;
  img?: string;
  text?: string;
}

interface LibraryEntry {
  id: string;
  sha1_hash: string;
  title: string;
  llm_title?: string;
  authors?: string;
  created_at: string;
  updated_at: string;
  file_creation_date?: string;
  file_modification_date?: string;
  file_size?: number;
  language?: string;
  extraction_quality?: number;
  plain_text?: string;
  report_names?: string[];
  references?: string[];
  sources?: string[];
  threat_actors?: ThreatActor[];
  files?: ReportFiles;
}

interface SearchResponse {
  status: string;
  data: LibraryEntry[];
}

interface InfoResponse {
  status: string;
  data: {
    library_entries: number;
    library_version: number;
    library_last_update: string;
    source_entries: number;
    threat_actor_entries: number;
  };
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatBytes(b?: number): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Orkl(): JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [info, setInfo] = useState<InfoResponse['data'] | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelected(null);
    try {
      const r = await fetch(`/api/v1/orkl/search?query=${encodeURIComponent(q.trim())}&limit=25&full=false`);
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `search failed (${r.status})`);
      }
      const body = (await r.json()) as SearchResponse;
      if (body.status !== 'success') throw new Error(body.status ?? 'orkl error');
      setResults(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const openDetail = async (entry: LibraryEntry) => {
    setSelected(entry);
    if (entry.plain_text) return;
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/v1/orkl/entry/${encodeURIComponent(entry.id)}?full=true`);
      if (!r.ok) throw new Error(`detail failed (${r.status})`);
      const body = (await r.json()) as { status: string; data: LibraryEntry };
      if (body.status === 'success' && body.data) {
        setSelected(body.data);
      }
    } catch {
      /* keep the basic entry */
    } finally {
      setDetailLoading(false);
    }
  };

  const loadInfo = async () => {
    if (info) {
      setShowInfo(!showInfo);
      return;
    }
    try {
      const r = await fetch('/api/v1/orkl/info');
      if (!r.ok) return;
      const body = (await r.json()) as InfoResponse;
      if (body.status === 'success' && body.data) {
        setInfo(body.data);
      }
    } catch {
      /* ignore */
    }
    setShowInfo(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <BookOpen size={28} className="text-brand-600 dark:text-brand-400" /> ORKL Library
        </h1>
        <p className="text-muted mb-6 max-w-2xl leading-relaxed">
          Search the{' '}
          <a
            href="https://orkl.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ORKL
          </a>{' '}
          open-source threat intelligence library — security reports, threat actor profiles, and vulnerability analyses
          aggregated from hundreds of sources. Click any entry to view full details.
        </p>
      </div>

      <button
        onClick={loadInfo}
        className="mb-6 text-xs font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
      >
        {showInfo && info ? 'hide' : 'show'} library stats
      </button>

      {showInfo && info && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          {[
            { label: 'Reports', value: info.library_entries.toLocaleString() },
            { label: 'Sources', value: info.source_entries.toLocaleString() },
            { label: 'Threat Actors', value: info.threat_actor_entries.toLocaleString() },
            { label: 'Version', value: `v${info.library_version}` },
            { label: 'Last Update', value: formatDate(info.library_last_update) },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{s.value}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
        className="flex flex-col sm:flex-row gap-3 mb-6"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search threat reports, actors, CVEs…"
          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-label="Search ORKL library"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} search
        </button>
      </form>

      <DataState loading={loading} error={error} empty={false} rows={4}>
        {results !== null && results.length === 0 && !loading && (
          <p className="font-mono text-sm text-slate-500 py-8 text-center">No results for &ldquo;{query}&rdquo;</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Results list */}
          {results !== null && results.length > 0 && (
            <div className={`space-y-2 ${selected ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </div>
              {results.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => openDetail(entry)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selected?.id === entry.id
                      ? 'border-brand-500/50 bg-brand-500/10'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2">
                    {entry.llm_title || entry.title || 'Untitled'}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] font-mono text-slate-500">
                    {entry.authors && (
                      <span className="inline-flex items-center gap-1">
                        <User size={10} /> {entry.authors}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={10} /> {formatDate(entry.file_creation_date || entry.created_at)}
                    </span>
                    {entry.sources && entry.sources[0] && (
                      <span className="inline-flex items-center gap-1">
                        <Globe size={10} /> {entry.sources[0]}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                  {selected.llm_title || selected.title || 'Untitled'}
                </h2>

                {selected.sha1_hash && (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-2">
                    <Hash size={10} /> {selected.sha1_hash}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-[11px] font-mono">
                  {selected.authors && (
                    <div>
                      <span className="text-slate-500">Authors</span>
                      <div className="text-slate-700 dark:text-slate-300">{selected.authors}</div>
                    </div>
                  )}
                  {selected.file_creation_date && (
                    <div>
                      <span className="text-slate-500">Published</span>
                      <div className="text-slate-700 dark:text-slate-300">
                        {formatDate(selected.file_creation_date)}
                      </div>
                    </div>
                  )}
                  {selected.language && (
                    <div>
                      <span className="text-slate-500">Language</span>
                      <div className="text-slate-700 dark:text-slate-300 uppercase">{selected.language}</div>
                    </div>
                  )}
                  {selected.file_size != null && (
                    <div>
                      <span className="text-slate-500">File Size</span>
                      <div className="text-slate-700 dark:text-slate-300">{formatBytes(selected.file_size)}</div>
                    </div>
                  )}
                  {selected.extraction_quality != null && (
                    <div>
                      <span className="text-slate-500">Extraction</span>
                      <div className="text-slate-700 dark:text-slate-300">
                        {Math.round(selected.extraction_quality * 100)}%
                      </div>
                    </div>
                  )}
                  {selected.sources && selected.sources.length > 0 && (
                    <div>
                      <span className="text-slate-500">Sources</span>
                      <div className="text-slate-700 dark:text-slate-300 truncate" title={selected.sources.join(', ')}>
                        {selected.sources.join(', ')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Threat actors */}
                {selected.threat_actors && selected.threat_actors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {selected.threat_actors.map((ta) => (
                      <span
                        key={ta.id}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      >
                        {ta.main_name}
                      </span>
                    ))}
                  </div>
                )}

                {/* External links */}
                <div className="flex flex-wrap gap-2">
                  {selected.files?.pdf && (
                    <a
                      href={selected.files.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:border-brand-500/40 transition-colors"
                    >
                      <FileText size={11} /> PDF
                    </a>
                  )}
                  {selected.references && selected.references.length > 0 && (
                    <a
                      href={selected.references[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:border-brand-500/40 transition-colors"
                    >
                      <Globe size={11} /> Source
                    </a>
                  )}
                </div>
              </div>

              {/* Plain text */}
              <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
                <h3 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Full Text
                </h3>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                  </div>
                ) : selected.plain_text ? (
                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                    {selected.plain_text}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No plain-text content available.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </DataState>
    </div>
  );
}
