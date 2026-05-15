import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Star, GitFork, GitCommit, FileCode } from 'lucide-react';
import { RulesSnapshotPanel } from '../../components/dfir/RulesSnapshotPanel';
interface SourceEntry {
  id: string;
  label: string;
  repo: string;
  type: string;
  description: string;
  rules_path: string;
  homepage?: string;
  stars?: number;
  forks?: number;
  pushed_at?: string;
  default_branch?: string;
  open_issues?: number;
  repo_url: string;
  rules_url: string;
  commits_url: string;
}

interface RecentCommit {
  source_id: string;
  source_label: string;
  type: string;
  title: string;
  author: string;
  link: string;
  pubDate: string;
}

interface RulesResponse {
  generated_at: string;
  sources: SourceEntry[];
  recent_commits: RecentCommit[];
}

const TYPE_COLOURS: Record<string, string> = {
  Sigma: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  YARA: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  Elastic: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  'Splunk SPL': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  KQL: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Suricata: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  DLP: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

function formatRel(dateStr: string): string {
  const t = new Date(dateStr).getTime();
  if (!t) return '';
  const ageSec = Math.floor((Date.now() - t) / 1000);
  if (ageSec < 60) return 'just now';
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)} min ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)} h ago`;
  if (ageSec < 7 * 86400) return `${Math.floor(ageSec / 86400)} d ago`;
  if (ageSec < 30 * 86400) return `${Math.floor(ageSec / (7 * 86400))} w ago`;
  return new Date(dateStr).toISOString().slice(0, 10);
}

function formatNum(n?: number): string {
  if (n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function Rules(): JSX.Element {
  const [data, setData] = useState<RulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/rules');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as RulesResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const types = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.sources.map((s) => s.type))).sort();
  }, [data]);

  const filteredSources = useMemo(() => {
    if (!data) return [];
    return typeFilter === 'all' ? data.sources : data.sources.filter((s) => s.type === typeFilter);
  }, [data, typeFilter]);

  const filteredCommits = useMemo(() => {
    if (!data) return [];
    return typeFilter === 'all' ? data.recent_commits : data.recent_commits.filter((c) => c.type === typeFilter);
  }, [data, typeFilter]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <FileCode size={28} className="text-brand-600 dark:text-brand-400" /> Detection Rules
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Live registry of the open-source detection rule sources defenders actually use: Sigma, YARA, Elastic, Splunk,
          KQL, Suricata. Pulled fresh from each repo's public metadata + commit feed, cached hourly. No GitHub auth
          required, no signup, no paid tier.
        </p>
      </div>

      <RulesSnapshotPanel />

      {loading && !data && <p className="font-mono text-sm text-slate-500">Loading rule sources…</p>}
      {error && (
        <p role="alert" className="font-mono text-sm text-rose-600 dark:text-rose-400">
          error: {error}
        </p>
      )}

      {data && (
        <>
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xs font-mono text-slate-600 dark:text-slate-400 mb-6">
            <span>
              <span className="text-slate-900 dark:text-slate-100 text-base font-bold">{data.sources.length}</span> rule
              sources
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-slate-900 dark:text-slate-100 text-base font-bold">
                {data.recent_commits.length}
              </span>{' '}
              recent commits
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> refresh
            </button>
          </header>

          {/* Type filter */}
          <div className="flex flex-wrap items-center gap-2 mb-8 text-xs font-mono">
            <span className="text-slate-500">Type:</span>
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-2 py-0.5 rounded border transition-colors ${
                typeFilter === 'all'
                  ? 'border-brand-500/50 text-slate-900 dark:text-slate-100 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              all
            </button>
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  typeFilter === t
                    ? 'border-brand-500/50 text-slate-900 dark:text-slate-100 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Source cards */}
          <section className="mb-12">
            <h2 className="font-display font-bold text-xl mb-4">Sources</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {filteredSources.map((s) => (
                <article
                  key={s.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
                >
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display font-semibold">{s.label}</h3>
                      <p className="text-xs font-mono text-slate-500 mt-0.5 break-all">{s.repo}</p>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border whitespace-nowrap ${TYPE_COLOURS[s.type] ?? 'border-slate-300'}`}
                    >
                      {s.type}
                    </span>
                  </header>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{s.description}</p>
                  <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Star size={12} /> {formatNum(s.stars)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitFork size={12} /> {formatNum(s.forks)}
                    </span>
                    {s.pushed_at && (
                      <span className="inline-flex items-center gap-1">
                        <GitCommit size={12} /> updated {formatRel(s.pushed_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-mono pt-1">
                    <a
                      href={s.rules_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-brand-500/40 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 hover:border-brand-500/70"
                    >
                      <FileCode size={11} /> browse rules
                    </a>
                    <a
                      href={s.commits_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
                    >
                      <GitCommit size={11} /> commits
                    </a>
                    <a
                      href={s.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
                    >
                      <ExternalLink size={11} /> repo
                    </a>
                    {s.homepage && (
                      <a
                        href={s.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
                      >
                        <ExternalLink size={11} /> downloads
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Recent commits */}
          <section className="mb-8">
            <h2 className="font-display font-bold text-xl mb-4">Recent rule activity</h2>
            {filteredCommits.length === 0 ? (
              <p className="text-sm font-mono text-slate-500">No recent commits for the current filter.</p>
            ) : (
              <ul className="space-y-2">
                {filteredCommits.map((c, i) => (
                  <li
                    key={`${c.source_id}-${i}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                  >
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="group block">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                          {c.title}
                        </div>
                        <ExternalLink size={11} className="text-slate-500 shrink-0 mt-1" />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs font-mono text-slate-500">
                        <span className={`px-1.5 py-0.5 rounded border ${TYPE_COLOURS[c.type] ?? 'border-slate-300'}`}>
                          {c.type}
                        </span>
                        <span className="text-brand-600 dark:text-brand-400 truncate">{c.source_label}</span>
                        {c.author && <span className="truncate">by {c.author}</span>}
                        {c.pubDate && <span className="ml-auto">{formatRel(c.pubDate)}</span>}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="text-xs font-mono text-slate-500 leading-relaxed">
            Sources and commits refresh hourly. No GitHub authentication required; all data comes from public repo
            metadata and the public commits.atom feed. Want to add a source? Pin it to me on{' '}
            <a
              href="https://github.com/Pranith-Jain/Pranith-Jain.github.io/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              GitHub
            </a>
            .
          </footer>
        </>
      )}
    </div>
  );
}
