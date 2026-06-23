import { useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Search, FolderOpen, File, AlertTriangle, Shield, Clock, Server, HardDrive, Info } from 'lucide-react';
import { SEVERITY_TONE, SEVERITY_BAR, type Severity } from '../../components/severity';

const API = '/api/v1';

interface DirEntry {
  name: string;
  type: 'file' | 'directory' | 'unknown';
  size: number | null;
  lastModified: string | null;
  extension: string | null;
  risk: Severity;
  riskReason?: string;
}

interface ScanResult {
  url: string;
  isOpen: boolean;
  isDirectoryListing: boolean;
  server: string | null;
  entries: DirEntry[];
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  indicators: string[];
  scanTimeMs: number;
  scannedAt: string;
  error?: string;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function OpenDirectory(): JSX.Element {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const scan = useCallback(async (targetUrl: string) => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API}/open-dir/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = (await res.json()) as ScanResult;
      if (!res.ok && !data.isOpen) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) void scan(url.trim());
  };

  const filteredEntries = result?.entries.filter((e) => filterRisk === 'all' || e.risk === filterRisk) ?? [];
  const riskCounts = result
    ? {
        critical: result.entries.filter((e) => e.risk === 'critical').length,
        high: result.entries.filter((e) => e.risk === 'high').length,
        medium: result.entries.filter((e) => e.risk === 'medium').length,
        low: result.entries.filter((e) => e.risk === 'low').length,
        info: result.entries.filter((e) => e.risk === 'info').length,
      }
    : { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        ← back to DFIR tools
      </Link>

      <h1 className="text-3xl font-display font-semibold mb-2">Open Directory Scanner</h1>
      <p className="text-muted mb-6">
        Scan HTTP servers for exposed open directories and catalog files for threat analysis. Identifies malware
        staging, credential dumps, config files, and other sensitive artifacts. Inspired by etugen.io's open-directory
        intel feature.
      </p>

      {/* Search */}
      <form onSubmit={onSubmit} className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <FolderOpen size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://suspicious-server.com/uploads/"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-sm font-mono focus-visible:ring-2 focus-visible:ring-brand-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? <Clock size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm font-mono">
          <AlertTriangle size={14} className="inline mr-2" />
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Files', value: result.totalFiles, icon: File },
              { label: 'Directories', value: result.totalDirectories, icon: FolderOpen },
              { label: 'Total Size', value: formatSize(result.totalSize), icon: HardDrive },
              { label: 'Server', value: result.server ?? '—', icon: Server },
              { label: 'Scan Time', value: `${result.scanTimeMs}ms`, icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="p-3 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} className="text-slate-400" />
                  <span className="text-micro font-mono uppercase text-slate-500">{label}</span>
                </div>
                <span className="text-lg font-mono font-bold">{value}</span>
              </div>
            ))}
          </div>

          {/* Open Directory Status */}
          <div
            className={`mb-6 p-3 rounded-lg border ${
              result.isOpen && result.isDirectoryListing
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                : result.isOpen
                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-50 dark:bg-[rgb(var(--surface-300))] border-slate-200 dark:border-[rgb(var(--border-400))] text-muted'
            }`}
          >
            {result.isOpen && result.isDirectoryListing ? (
              <>
                <Shield size={14} className="inline mr-2" />
                <strong>Open directory detected.</strong> This server exposes a directory listing with{' '}
                {result.totalFiles} files.
              </>
            ) : result.isOpen ? (
              <>
                <Info size={14} className="inline mr-2" />
                URL is accessible but doesn't appear to be a standard directory listing.
              </>
            ) : (
              <>
                <AlertTriangle size={14} className="inline mr-2" />
                URL is not accessible or not an open directory.
              </>
            )}
          </div>

          {/* Indicators */}
          {result.indicators.length > 0 && (
            <div className="mb-6 p-3 rounded-lg border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Risk Indicators
              </h3>
              <ul className="space-y-1">
                {result.indicators.map((ind, i) => (
                  <li key={i} className="text-xs font-mono text-rose-700 dark:text-rose-300">
                    {ind}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['all', 'critical', 'high', 'medium', 'low', 'info'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilterRisk(r)}
                className={`px-2.5 py-1 rounded text-xs font-mono capitalize transition-colors ${
                  filterRisk === r
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {r} {r !== 'all' && `(${riskCounts[r]})`}
                {r === 'all' && `(${result.entries.length})`}
              </button>
            ))}
          </div>

          {/* File List */}
          <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-[rgb(var(--surface-200))] sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-mono font-semibold text-muted">Name</th>
                    <th className="px-3 py-2 text-left font-mono font-semibold text-muted w-20">Type</th>
                    <th className="px-3 py-2 text-right font-mono font-semibold text-muted w-24">Size</th>
                    <th className="px-3 py-2 text-left font-mono font-semibold text-muted w-20">Risk</th>
                    <th className="px-3 py-2 text-left font-mono font-semibold text-muted w-48">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr
                      key={entry.name}
                      className={`border-t border-slate-100 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.5)] cursor-pointer ${
                        entry.risk === 'critical' ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''
                      }`}
                      onClick={() => setExpandedEntry(expandedEntry === entry.name ? null : entry.name)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {entry.type === 'directory' ? (
                            <FolderOpen size={12} className="text-amber-500 flex-shrink-0" />
                          ) : (
                            <File size={12} className="text-slate-400 flex-shrink-0" />
                          )}
                          <span
                            className={`font-mono truncate ${entry.risk === 'critical' ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}`}
                          >
                            {entry.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {entry.extension ?? (entry.type === 'directory' ? 'dir' : '—')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{formatSize(entry.size)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-mono uppercase border ${SEVERITY_TONE[entry.risk]}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_BAR[entry.risk]}`} />
                          {entry.risk}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{entry.riskReason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEntries.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                {result.entries.length === 0
                  ? 'No files found in this directory.'
                  : `No ${filterRisk}-risk files found.`}
              </div>
            )}
          </div>
        </>
      )}

      {!result && !loading && !error && (
        <div className="text-center py-16">
          <FolderOpen size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-400" />
          <p className="text-slate-500">Enter a URL to scan for exposed open directories</p>
          <p className="text-xs text-slate-400 mt-1">
            Identifies malware staging, credential dumps, config files, and other sensitive artifacts
          </p>
        </div>
      )}
    </div>
  );
}
