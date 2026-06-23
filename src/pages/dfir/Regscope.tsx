import { useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, FolderTree, HelpCircle } from 'lucide-react';
import { KNOWN_KEYS, type RegistryEntry } from '../../data/registry-keys';

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  medium:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
  low: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400 border-slate-300 dark:border-[rgb(var(--border-400))]',
};

export default function Regscope(): JSX.Element {
  const [keyPath, setKeyPath] = useState('');
  const [result, setResult] = useState<RegistryEntry | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tacticFilter, setTacticFilter] = useState<string>('all');

  const categories = [...new Set(KNOWN_KEYS.map((k) => k.category))];
  const tactics = [...new Set(KNOWN_KEYS.map((k) => k.tactic))];

  const filtered = useMemo(() => {
    return KNOWN_KEYS.filter(
      (k) =>
        (categoryFilter === 'all' || k.category === categoryFilter) &&
        (tacticFilter === 'all' || k.tactic === tacticFilter)
    );
  }, [categoryFilter, tacticFilter]);

  const analyzeKey = () => {
    const normalized = keyPath.trim().toLowerCase().replace(/\\/g, '\\');
    if (!normalized) {
      setResult(null);
      return;
    }

    const matched = KNOWN_KEYS.find((k) => normalized.startsWith(k.path.toLowerCase()));
    if (matched) {
      setResult(matched);
    } else {
      const parts = normalized.split('\\');
      for (let i = parts.length - 1; i >= 1; i--) {
        const ancestor = parts.slice(0, i).join('\\');
        const match = KNOWN_KEYS.find((k) => k.path.toLowerCase() === ancestor);
        if (match) {
          setResult(match);
          return;
        }
      }
      setResult(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <FolderTree size={28} className="text-brand-600 dark:text-brand-400" /> REGSCOPE
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Analyze Windows registry key paths for known persistence, defense evasion, and credential access techniques.
          Contains {KNOWN_KEYS.length} entries across {categories.length} categories and {tactics.length} ATT&CK
          tactics. 100% client-side — no data leaves your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search size={14} className="text-slate-400" />
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Registry Key Path</span>
            </div>

            <input
              type="text"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="HKLM\Software\Microsoft\Windows\CurrentVersion\Run"
              className="w-full rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 font-mono"
            />

            <p className="text-micro font-mono text-slate-400 mt-2">
              Full paths supported. The analyzer walks up the path to find the nearest known parent key.
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-micro font-mono text-slate-400 self-center">Hive shortcuts:</span>
              {['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC'].map((hive) => (
                <span
                  key={hive}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]"
                >
                  {hive}
                </span>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={analyzeKey}
                disabled={!keyPath.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Search size={16} /> Analyze Key
              </button>
              <button
                type="button"
                onClick={() => {
                  setKeyPath('');
                  setResult(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))]/40 border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.6)] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Key Database</span>
              <span className="text-xs font-mono text-slate-400">{KNOWN_KEYS.length} entries</span>
              <span className="ml-auto text-xs text-slate-400">{showAll ? '▲' : '▼'}</span>
            </button>

            {showAll && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-2 py-1 text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={tacticFilter}
                    onChange={(e) => setTacticFilter(e.target.value)}
                    className="px-2 py-1 text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">All Tactics</option>
                    {tactics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {filtered.map((entry) => (
                    <div
                      key={entry.path}
                      role="button"
                      tabIndex={0}
                      className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5 hover:border-brand-500/30 cursor-pointer transition-colors"
                      onClick={() => {
                        setKeyPath(entry.path);
                        setResult(entry);
                        setShowAll(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setKeyPath(entry.path);
                          setResult(entry);
                          setShowAll(false);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all">
                          {entry.path}
                        </code>
                        <span
                          className={`shrink-0 text-micro font-mono px-1 py-0.5 rounded border ${RISK_COLORS[entry.risk]}`}
                        >
                          {entry.risk}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-micro font-mono text-brand-600 dark:text-brand-400">
                          {entry.techniqueId}
                        </span>
                        <span className="text-micro font-mono text-slate-400">·</span>
                        <span className="text-micro font-mono text-slate-400">{entry.tactic}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          {!result && !keyPath.trim() && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/20 p-8 flex flex-col items-center justify-center text-center">
              <FolderTree size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                Paste a registry key path and click Analyze
              </p>
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-2">
                Supports persistence, defense evasion, credential access, discovery, and known malware keys
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">
                      Known Key Match
                    </h3>
                    <code className="text-xs font-mono text-muted break-all">{result.path}</code>
                  </div>
                  <span
                    className={`shrink-0 text-micro font-mono font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${RISK_COLORS[result.risk]}`}
                  >
                    {result.risk}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Category</span>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-1">{result.category}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Tactic</span>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-1">{result.tactic}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-3 mb-3">
                  <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Description</span>
                  <p className="text-xs font-mono text-muted mt-1">{result.description}</p>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-3 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">ATT&CK</span>
                  </div>
                  <span className="inline-block text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 mr-1">
                    {result.techniqueId}
                  </span>
                  <span className="text-xs font-mono text-muted">{result.technique}</span>
                </div>

                {result.malware.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">
                      Associated Malware
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.malware.map((m) => (
                        <span
                          key={m}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {keyPath.trim() && !result && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <HelpCircle size={16} />
                <p className="text-sm font-mono">
                  Key not recognized. The analyzer walks up the path to find the nearest known parent — try using a
                  higher-level path.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">
        H3AD-DF / REGSCOPE · {KNOWN_KEYS.length} entries · Client-side only · No backend
      </p>
    </div>
  );
}
